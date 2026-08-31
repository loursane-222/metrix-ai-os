import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeActionMock, buildExecutionContextMock } = vi.hoisted(() => ({
  executeActionMock: vi.fn(),
  buildExecutionContextMock: vi.fn(),
}));

vi.mock("@/lib/action-runtime/composition/production-execution-runtime", () => ({
  productionExecutionRuntime: { executeAction: executeActionMock },
}));
vi.mock("@/lib/action-runtime/gateway/execution-context", () => ({
  buildExecutionContext: buildExecutionContextMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { createBusinessCandidateActionRuntimeExecutor } from "../business-candidate-action-runtime.executor";

const auth = { user: { id: "user-1" }, organization: { id: "org-1" }, membership: { organizationId: "org-1" } } as never;

function change(fieldPath: string, proposedValue: string) {
  return { changeId: `c-${fieldPath}`, fieldPath, proposedValue, previousValue: null };
}

function baseInput(targetDomain: string, approvedChanges: ReturnType<typeof change>[]) {
  return {
    candidateId: "candidate-1",
    organizationId: "org-1",
    targetDomain,
    targetRecordId: null,
    operation: "CREATE" as const,
    provenance: { source: "document-intelligence" },
    approvedChanges,
    idempotencyKey: "idem-1",
  };
}

describe("Phase 14 document intelligence — Action Runtime bridge", () => {
  beforeEach(() => {
    executeActionMock.mockReset().mockResolvedValue({ status: "SUCCESS", executionId: "exec-1", entityRef: { entityId: "record-1" }, outcome: "SUCCEEDED" });
    buildExecutionContextMock.mockReset().mockReturnValue({ actorId: "user-1", organizationId: "org-1", role: "EMPLOYEE", permissions: ["expenses.write"], sessionRef: "s1", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z" });
  });

  it("Expense candidate promotes to expense.create with exactly the approved fields, amounts as numbers", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await executor(baseInput("Expense", [
      change("title", "Ofis kirası"),
      change("category", "RENT"),
      change("amount", "12500.50"),
      change("expenseDate", "2026-09-01"),
      change("vendorName", "Atlas Emlak"),
    ]));
    const call = executeActionMock.mock.calls[0]![0];
    expect(call.actionName).toBe("expense.create");
    expect(call.input).toMatchObject({ title: "Ofis kirası", category: "RENT", amount: 12500.5, expenseDate: "2026-09-01", vendorName: "Atlas Emlak" });
  });

  it("Expense candidate missing a required field (title) fails closed rather than defaulting", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await expect(executor(baseInput("Expense", [
      change("category", "RENT"),
      change("amount", "100"),
      change("expenseDate", "2026-09-01"),
    ]))).rejects.toThrow("BUSINESS_CANDIDATE_REQUIRED_FIELD_TITLE");
  });

  it("PurchaseInvoice candidate promotes to purchaseInvoice.createFromPurchaseOrder with the resolved purchaseOrderId", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await executor(baseInput("PurchaseInvoice", [
      change("purchaseOrderId", "po-1"),
      change("supplierInvoiceNumber", "SUP-2026-001"),
      change("dueDate", "2026-10-01"),
    ]));
    const call = executeActionMock.mock.calls[0]![0];
    expect(call.actionName).toBe("purchaseInvoice.createFromPurchaseOrder");
    expect(call.input).toMatchObject({ purchaseOrderId: "po-1", supplierInvoiceNumber: "SUP-2026-001", dueDate: "2026-10-01" });
  });

  it("PurchaseInvoice candidate without a resolved purchaseOrderId fails closed — there is no standalone purchase-invoice creation action", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await expect(executor(baseInput("PurchaseInvoice", [
      change("supplierInvoiceNumber", "SUP-2026-001"),
    ]))).rejects.toThrow("BUSINESS_CANDIDATE_REQUIRED_FIELD_PURCHASEORDERID");
  });

  it("FinancialInstrument (cheque, RECEIVED) candidate promotes with customerId, never invents a supplierId", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await executor(baseInput("FinancialInstrument", [
      change("instrumentType", "CHEQUE"),
      change("direction", "RECEIVED"),
      change("amount", "5000"),
      change("maturityDate", "2026-12-01"),
      change("customerId", "customer-1"),
    ]));
    const call = executeActionMock.mock.calls[0]![0];
    expect(call.actionName).toBe("financialInstrument.register");
    expect(call.input).toMatchObject({ instrumentType: "CHEQUE", direction: "RECEIVED", amount: 5000, maturityDate: "2026-12-01", customerId: "customer-1" });
    expect(call.input.supplierId).toBeUndefined();
  });

  it("FinancialInstrument candidate with neither customerId nor supplierId fails closed", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await expect(executor(baseInput("FinancialInstrument", [
      change("instrumentType", "PROMISSORY_NOTE"),
      change("direction", "ISSUED"),
      change("amount", "5000"),
      change("maturityDate", "2026-12-01"),
    ]))).rejects.toThrow("BUSINESS_CANDIDATE_REQUIRED_FIELD_COUNTERPARTY");
  });

  it("FinancialInstrument candidate with an invalid instrumentType fails closed instead of passing it through", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await expect(executor(baseInput("FinancialInstrument", [
      change("instrumentType", "BANK_TRANSFER"),
      change("direction", "ISSUED"),
      change("amount", "5000"),
      change("maturityDate", "2026-12-01"),
      change("supplierId", "supplier-1"),
    ]))).rejects.toThrow("BUSINESS_CANDIDATE_INVALID_INSTRUMENT_TYPE");
  });

  it("an unrecognized targetDomain still throws the existing unsupported-operation error (no accidental catch-all)", async () => {
    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    await expect(executor(baseInput("SomeOtherDomain", [change("x", "y")]))).rejects.toThrow("BUSINESS_CANDIDATE_UNSUPPORTED_CANONICAL_OPERATION");
  });
});
