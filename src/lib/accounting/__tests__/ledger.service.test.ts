import { describe, expect, it, vi } from "vitest";
import { recordExpenseCreated, recordExpensePaid, recordInvoiceSent, recordPaymentPaid, reverseSourceEntries, toCents } from "../ledger.service";

function transaction() {
  return {
    ledgerEntry: {
      create: vi.fn(async (args) => ({ id: "entry-1", ...args.data, lines: args.data.lines.create })),
      findMany: vi.fn(),
    },
  };
}

describe("double-entry ledger", () => {
  it("records a taxed sent invoice as balanced 120 / 600 + 391 lines", async () => {
    const tx = transaction();
    await recordInvoiceSent({ tx: tx as never, organizationId: "org-1", invoiceId: "inv-1", entryDate: new Date("2026-08-06T09:00:00Z"), netAmount: "1000.00", taxAmount: "200.00", totalAmount: "1200.00", currency: "TRY" });
    const lines = tx.ledgerEntry.create.mock.calls[0]![0].data.lines.create;
    expect(lines).toEqual([
      { accountId: "ledger-account-120", debitCents: BigInt(120000), creditCents: BigInt(0), currency: "TRY" },
      { accountId: "ledger-account-600", debitCents: BigInt(0), creditCents: BigInt(100000), currency: "TRY" },
      { accountId: "ledger-account-391", debitCents: BigInt(0), creditCents: BigInt(20000), currency: "TRY" },
    ]);
    expect(sum(lines, "debitCents")).toBe(sum(lines, "creditCents"));
  });

  it("records expense recognition, expense payment and aggregate customer payment with the selected accounts", async () => {
    const tx = transaction();
    const common = { tx: tx as never, organizationId: "org-1", entryDate: new Date(), amount: "250.50", currency: "TRY" };
    await recordExpenseCreated({ ...common, expenseId: "expense-1" });
    await recordExpensePaid({ ...common, expenseId: "expense-1" });
    await recordPaymentPaid({ ...common, paymentId: "payment-1" });
    expect(tx.ledgerEntry.create.mock.calls.map((call) => call[0].data.lines.create.map((line: { accountId: string }) => line.accountId))).toEqual([
      ["ledger-account-770", "ledger-account-320"],
      ["ledger-account-320", "ledger-account-100"],
      ["ledger-account-100", "ledger-account-120"],
    ]);
  });

  it("creates a one-time reversed entry by swapping debit and credit", async () => {
    const tx = transaction();
    tx.ledgerEntry.findMany.mockResolvedValue([{ id: "original-1", description: "Gider kaydedildi", lines: [{ accountId: "ledger-account-770", debitCents: BigInt(10000), creditCents: BigInt(0), currency: "TRY" }, { accountId: "ledger-account-320", debitCents: BigInt(0), creditCents: BigInt(10000), currency: "TRY" }] }]);
    await reverseSourceEntries({ tx: tx as never, organizationId: "org-1", sourceType: "EXPENSE", sourceId: "expense-1", entryDate: new Date() });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reversalOfId: "original-1", lines: { create: [
      { accountId: "ledger-account-770", debitCents: BigInt(0), creditCents: BigInt(10000), currency: "TRY" },
      { accountId: "ledger-account-320", debitCents: BigInt(10000), creditCents: BigInt(0), currency: "TRY" },
    ] } }) }));
  });

  it("converts canonical two-decimal money to integer cents", () => {
    expect(toCents("1234.56")).toBe(BigInt(123456));
  });
});

function sum(lines: Array<Record<string, bigint>>, key: "debitCents" | "creditCents") {
  return lines.reduce((total, line) => total + line[key]!, BigInt(0));
}
