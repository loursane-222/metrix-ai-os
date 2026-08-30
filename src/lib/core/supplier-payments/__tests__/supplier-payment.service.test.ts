import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const {
  findPurchaseInvoiceByIdMock,
  applySupplierPaymentAmountMock,
  recordSupplierPaymentApplicationMock,
  reverseSourceEntriesMock,
  listFinancialAccountsMock,
  resolveFinancialAccountMock,
  assertMethodAccountCompatibilityMock,
  assertTransactionCurrencyMatchesAccountMock,
  createSupplierPaymentMock,
  createSupplierPaymentMovementMock,
  findSupplierPaymentByIdempotencyKeyMock,
  findSupplierPaymentByReversalOfIdMock,
  findSupplierPaymentForReversalMock,
  sumNetSupplierPaymentsMock,
  movementFindFirstMock,
} = vi.hoisted(() => ({
  findPurchaseInvoiceByIdMock: vi.fn(),
  applySupplierPaymentAmountMock: vi.fn(),
  recordSupplierPaymentApplicationMock: vi.fn(),
  reverseSourceEntriesMock: vi.fn(),
  listFinancialAccountsMock: vi.fn(),
  resolveFinancialAccountMock: vi.fn(),
  assertMethodAccountCompatibilityMock: vi.fn(),
  assertTransactionCurrencyMatchesAccountMock: vi.fn(),
  createSupplierPaymentMock: vi.fn(),
  createSupplierPaymentMovementMock: vi.fn(),
  findSupplierPaymentByIdempotencyKeyMock: vi.fn(),
  findSupplierPaymentByReversalOfIdMock: vi.fn(),
  findSupplierPaymentForReversalMock: vi.fn(),
  sumNetSupplierPaymentsMock: vi.fn(),
  movementFindFirstMock: vi.fn(),
}));

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
}

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
    financialAccountMovement: { findFirst: movementFindFirstMock },
  },
}));

vi.mock("@/lib/core/purchase-invoices/purchase-invoice.repository", async () => {
  const actual = await vi.importActual<typeof import("../../purchase-invoices/purchase-invoice.repository")>("../../purchase-invoices/purchase-invoice.repository");
  return {
    SupplierPaymentConcurrentlyModifiedError: actual.SupplierPaymentConcurrentlyModifiedError,
    findPurchaseInvoiceById: findPurchaseInvoiceByIdMock,
    applySupplierPaymentAmount: applySupplierPaymentAmountMock,
  };
});

vi.mock("@/lib/accounting/ledger.service", () => ({
  recordSupplierPaymentApplication: recordSupplierPaymentApplicationMock,
  reverseSourceEntries: reverseSourceEntriesMock,
}));

vi.mock("@/lib/financial-accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/financial-accounts")>("@/lib/financial-accounts");
  return {
    ...actual,
    listFinancialAccounts: listFinancialAccountsMock,
    resolveFinancialAccount: resolveFinancialAccountMock,
    assertMethodAccountCompatibility: assertMethodAccountCompatibilityMock,
    assertTransactionCurrencyMatchesAccount: assertTransactionCurrencyMatchesAccountMock,
  };
});

vi.mock("../supplier-payment.repository", () => ({
  createSupplierPayment: createSupplierPaymentMock,
  createSupplierPaymentMovement: createSupplierPaymentMovementMock,
  findSupplierPaymentByIdempotencyKey: findSupplierPaymentByIdempotencyKeyMock,
  findSupplierPaymentByReversalOfId: findSupplierPaymentByReversalOfIdMock,
  findSupplierPaymentForReversal: findSupplierPaymentForReversalMock,
  sumNetSupplierPayments: sumNetSupplierPaymentsMock,
}));

import { applySupplierPayment, reverseSupplierPayment } from "../supplier-payment.service";

const ORG = "org-1";
const ACCOUNT = { id: "account-1", organizationId: ORG, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY", status: "ACTIVE" };

function purchaseInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "pi-1", organizationId: ORG, supplierInvoiceNumber: "SUP-1", totalAmount: 1000, paidAmount: 0, currency: "TRY", status: "CONFIRMED", ...overrides };
}

describe("applySupplierPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFinancialAccountsMock.mockResolvedValue([ACCOUNT]);
    resolveFinancialAccountMock.mockReturnValue({ kind: "RESOLVED", account: ACCOUNT });
    assertMethodAccountCompatibilityMock.mockReturnValue(undefined);
    assertTransactionCurrencyMatchesAccountMock.mockReturnValue(undefined);
    createSupplierPaymentMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "supplier-payment-1", ...input }));
    createSupplierPaymentMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "movement-1", ...input }));
    applySupplierPaymentAmountMock.mockImplementation(async (input: { paidAmount: number; status: string }) => purchaseInvoice({ paidAmount: input.paidAmount, status: input.status }));
    findSupplierPaymentByIdempotencyKeyMock.mockResolvedValue(null);
  });

  it("rejects an amount exceeding the remaining purchase invoice balance", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 900 }));
    await expect(
      applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 200, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(createSupplierPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects settling a DRAFT (not yet confirmed) purchase invoice", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ status: "DRAFT" }));
    await expect(
      applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects settling a cancelled purchase invoice", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ status: "CANCELLED" }));
    await expect(
      applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("fails closed on an unsupported settlement method before resolving any account", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice());
    await expect(
      applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CHEQUE" as never, financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(listFinancialAccountsMock).not.toHaveBeenCalled();
  });

  it("records two partial supplier payments as two distinct incremental ledger postings and lands on PAID only once fully covered", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValueOnce(purchaseInvoice({ paidAmount: 0 }));
    await applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 400, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    findPurchaseInvoiceByIdMock.mockResolvedValueOnce(purchaseInvoice({ paidAmount: 400 }));
    await applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 600, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    expect(recordSupplierPaymentApplicationMock).toHaveBeenCalledTimes(2);
    expect(applySupplierPaymentAmountMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ paidAmount: 400, status: "CONFIRMED" }), expect.anything());
    expect(applySupplierPaymentAmountMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ paidAmount: 1000, status: "PAID" }), expect.anything());
  });

  it("creates the movement with direction OUT — a real cash outflow", async () => {
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice());
    await applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });
    expect(createSupplierPaymentMovementMock).toHaveBeenCalledWith(expect.objectContaining({ direction: "OUT" }), expect.anything());
  });

  describe("IDEMPOTENCY", () => {
    it("replays an existing supplier payment on idempotency-key match without creating a new one", async () => {
      findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 400 }));
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

      const original = await applySupplierPayment({
        organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
        occurredAt: new Date("2026-09-01T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
      });
      const storedHash = createSupplierPaymentMock.mock.calls[0]![0].requestHash;

      findSupplierPaymentByIdempotencyKeyMock.mockResolvedValue({ id: "supplier-payment-1", currency: "TRY", requestHash: storedHash });
      createSupplierPaymentMock.mockClear();
      const replay = await applySupplierPayment({
        organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
        occurredAt: new Date("2026-09-01T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
      });

      expect(original?.replayed).toBe(false);
      expect(replay?.replayed).toBe(true);
      expect(createSupplierPaymentMock).not.toHaveBeenCalled();
    });

    it("rejects a replay attempt whose payload no longer matches the stored request hash", async () => {
      findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 400 }));
      findSupplierPaymentByIdempotencyKeyMock.mockResolvedValue({ id: "supplier-payment-1", currency: "TRY", requestHash: "a-different-hash" });
      await expect(
        applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("CONCURRENT: two simultaneous requests with the same idempotencyKey produce exactly one committed SupplierPayment — the loser replays it", async () => {
      findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 0 }));
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });
      findSupplierPaymentByIdempotencyKeyMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      let committed: Record<string, unknown> | null = null;
      createSupplierPaymentMock.mockImplementation(async (input: Record<string, unknown>) => {
        if (committed) throw p2002();
        committed = { id: "supplier-payment-1", ...input };
        return committed;
      });
      findSupplierPaymentByIdempotencyKeyMock.mockImplementation(async () => committed as never);

      const attempt = () =>
        applySupplierPayment({
          organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
          occurredAt: new Date("2026-09-01T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
        });

      const [outcomeA, outcomeB] = await Promise.all([attempt(), attempt()]);
      const outcomes = [outcomeA, outcomeB];

      expect(outcomes.filter((outcome) => outcome?.replayed === false)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome?.replayed === true)).toHaveLength(1);
      expect(outcomeA?.settlement.id).toBe(outcomeB?.settlement.id);
    });
  });

  describe("CONCURRENT CEILING", () => {
    it("gives up with a clear 409 after exhausting the concurrent-modification retry budget", async () => {
      findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 0 }));
      const { SupplierPaymentConcurrentlyModifiedError } = await import("@/lib/core/purchase-invoices/purchase-invoice.repository");
      applySupplierPaymentAmountMock.mockImplementation(async () => {
        throw new SupplierPaymentConcurrentlyModifiedError("pi-1");
      });
      await expect(
        applySupplierPayment({ organizationId: ORG, purchaseInvoiceId: "pi-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(applySupplierPaymentAmountMock).toHaveBeenCalledTimes(5);
    });
  });
});

describe("reverseSupplierPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupplierPaymentMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-payment-1", ...input }));
    createSupplierPaymentMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-movement-1", ...input }));
  });

  it("reverses a supplier payment and moves the purchase invoice back from PAID to CONFIRMED", async () => {
    findSupplierPaymentForReversalMock.mockResolvedValue({
      id: "supplier-payment-1", kind: "ORIGINAL", purchaseInvoiceId: "pi-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
      movement: { id: "movement-1" }, reversal: null,
    });
    sumNetSupplierPaymentsMock.mockResolvedValue(400);
    findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 1000, status: "PAID" }));
    applySupplierPaymentAmountMock.mockResolvedValue(purchaseInvoice({ paidAmount: 400, status: "CONFIRMED" }));

    const outcome = await reverseSupplierPayment({ organizationId: ORG, supplierPaymentId: "supplier-payment-1", reason: "yanlış tutar", actorId: "actor-1" });

    expect(outcome?.purchaseInvoice.status).toBe("CONFIRMED");
    expect(reverseSourceEntriesMock).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "SUPPLIER_PAYMENT", sourceId: "supplier-payment-1" }));
    expect(createSupplierPaymentMovementMock).toHaveBeenCalledWith(expect.objectContaining({ direction: "IN", reversalOfId: "movement-1" }), expect.anything());
  });

  it("rejects reversing a supplier payment that has already been reversed", async () => {
    findSupplierPaymentForReversalMock.mockResolvedValue({ id: "supplier-payment-1", kind: "ORIGINAL", reversal: { id: "reversal-1" }, movement: { id: "movement-1" } });
    await expect(reverseSupplierPayment({ organizationId: ORG, supplierPaymentId: "supplier-payment-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects reversing a reversal itself", async () => {
    findSupplierPaymentForReversalMock.mockResolvedValue({ id: "reversal-1", kind: "REVERSAL", reversal: null, movement: { id: "movement-1" } });
    await expect(reverseSupplierPayment({ organizationId: ORG, supplierPaymentId: "reversal-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("requires a non-empty reason", async () => {
    await expect(reverseSupplierPayment({ organizationId: ORG, supplierPaymentId: "supplier-payment-1", reason: "  ", actorId: "actor-1" })).rejects.toMatchObject({ status: 400 });
  });

  describe("REVERSAL IDEMPOTENCY", () => {
    it("replays the existing reversal instead of producing a second economic reversal when a P2002 race is hit on reversalOfId", async () => {
      const original = {
        id: "supplier-payment-1", kind: "ORIGINAL", purchaseInvoiceId: "pi-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
        movement: { id: "movement-1" }, reversal: null,
      };
      findSupplierPaymentForReversalMock.mockResolvedValue(original);
      createSupplierPaymentMock.mockRejectedValueOnce(p2002());
      const existingReversal = { id: "reversal-payment-1", purchaseInvoiceId: "pi-1", movement: { id: "reversal-movement-1" } };
      findSupplierPaymentByReversalOfIdMock.mockResolvedValue(existingReversal);
      findPurchaseInvoiceByIdMock.mockResolvedValue(purchaseInvoice({ paidAmount: 400, status: "CONFIRMED" }));

      const outcome = await reverseSupplierPayment({ organizationId: ORG, supplierPaymentId: "supplier-payment-1", reason: "yanlış tutar", actorId: "actor-1" });

      expect(outcome?.settlement.id).toBe("reversal-payment-1");
      expect(outcome?.movement.id).toBe("reversal-movement-1");
    });
  });
});
