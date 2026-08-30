import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { assertSupportedSettlementMethod as assertSettlementMethod } from "../../settlements/settlement.contract";
import { assertSupportedSettlementMethod as assertExpenseSettlementMethod } from "../../expenses/expense-settlement.contract";
import { assertSupportedSettlementMethod as assertSupplierPaymentMethod } from "../../supplier-payments/supplier-payment.contract";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Phase 10 Instrument Authority — canonical schema/authority contract", () => {
  it("FinancialInstrument/InstrumentStatusHistory/InstrumentAllocation all exist, org-scoped", () => {
    const schema = read("prisma/schema.prisma");
    for (const model of ["FinancialInstrument", "InstrumentStatusHistory", "InstrumentAllocation"]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("§LEGACY PAYMENT METHOD BYPASS AUDIT: PaymentMethod.CHEQUE/PROMISSORY_NOTE are still rejected as a real settlement rail by all three settlement authorities post-Phase-10", () => {
    // This is the exact adversarial check the roadmap names: Phase 10 must
    // NOT lift the Phase 3/4/9 fail-closed guard — clearing an instrument
    // always settles through a REAL CASH/BANK_TRANSFER rail, never by
    // reclassifying the instrument itself as the settlement method.
    for (const assertFn of [assertSettlementMethod, assertExpenseSettlementMethod, assertSupplierPaymentMethod]) {
      expect(() => assertFn(PaymentMethod.CHEQUE)).toThrow();
      expect(() => assertFn(PaymentMethod.PROMISSORY_NOTE)).toThrow();
      expect(() => assertFn(PaymentMethod.CASH)).not.toThrow();
      expect(() => assertFn(PaymentMethod.BANK_TRANSFER)).not.toThrow();
    }
  });

  it("financial-instrument.service.ts never creates a FinancialAccountMovement directly — only via composing applySettlement/settleExpense/applySupplierPayment", () => {
    const service = read("src/lib/core/financial-instruments/financial-instrument.service.ts");
    expect(service).not.toMatch(/financialAccountMovement\.create|createSettlementMovement|createExpenseSettlementMovement|createSupplierPaymentMovement/i);
    expect(service).toContain("applySettlement(");
    expect(service).toContain("settleExpense(");
    expect(service).toContain("applySupplierPayment(");
  });

  it("registerInstrument (receipt/issuance) never calls any settlement authority — instrument ≠ cash at creation", () => {
    const service = read("src/lib/core/financial-instruments/financial-instrument.service.ts");
    const fnStart = service.indexOf("export async function registerInstrument");
    const fnEnd = service.indexOf("\n}", fnStart);
    const fnBody = service.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/applySettlement|settleExpense|applySupplierPayment/);
  });

  it("applyInstrumentToObligation never touches Payment/Expense/PurchaseInvoice.paidAmount — allocation ≠ cash-settled", () => {
    const service = read("src/lib/core/financial-instruments/financial-instrument.service.ts");
    const fnStart = service.indexOf("export async function applyInstrumentToObligation");
    const fnEnd = service.indexOf("\nexport async function clearInstrument", fnStart);
    const fnBody = service.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/applyPaymentAmount|applyExpenseSettlementAmount|applySupplierPaymentAmount/);
  });

  it("maturityDate is a required, real column on FinancialInstrument — ready for Phase 12 Calendar projection without a model change", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("maturityDate     DateTime");
  });

  it("Instrument lifecycle history is immutable and append-only — InstrumentStatusHistory has no update/delete caller", () => {
    const repo = read("src/lib/core/financial-instruments/financial-instrument.repository.ts");
    expect(repo).toContain("instrumentStatusHistory.create");
    expect(repo).not.toMatch(/instrumentStatusHistory\.(update|delete)/);
  });

  it("InstrumentAllocation's amount/kind are immutable — the only update path (markInstrumentAllocationSettled) touches solely the post-hoc settledReference pointer, never amount/kind/reversalOfId, and delete is never called", () => {
    const repo = read("src/lib/core/financial-instruments/financial-instrument.repository.ts");
    expect(repo).not.toContain("instrumentAllocation.delete");
    const updateCallStart = repo.indexOf("tx.instrumentAllocation.updateMany");
    const updateCallEnd = repo.indexOf("});", updateCallStart);
    const updateCallBody = repo.slice(updateCallStart, updateCallEnd);
    expect(updateCallBody).toContain("settledReferenceType");
    expect(updateCallBody).not.toMatch(/\bamount\b|\bkind\b|reversalOfId/);
  });
});
