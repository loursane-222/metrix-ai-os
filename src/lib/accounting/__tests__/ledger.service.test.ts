import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { recordExpenseCreated, recordExpenseSettlementApplication, recordInvoiceSent, recordPaymentApplication, reverseSourceEntries, toCents } from "../ledger.service";

function transaction() {
  return {
    ledgerEntry: {
      create: vi.fn(async (args) => ({ id: "entry-1", ...args.data, lines: args.data.lines.create })),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
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

  it("records expense recognition, expense settlement and an incremental payment application with the selected accounts", async () => {
    const tx = transaction();
    const common = { tx: tx as never, organizationId: "org-1", entryDate: new Date(), amount: "250.50", currency: "TRY" };
    await recordExpenseCreated({ ...common, expenseId: "expense-1" });
    await recordExpenseSettlementApplication({ ...common, expenseSettlementId: "expense-settlement-1" });
    await recordPaymentApplication({ ...common, applicationId: "application-1" });
    expect(tx.ledgerEntry.create.mock.calls.map((call) => call[0].data.lines.create.map((line: { accountId: string }) => line.accountId))).toEqual([
      ["ledger-account-770", "ledger-account-320"],
      ["ledger-account-320", "ledger-account-100"],
      ["ledger-account-100", "ledger-account-120"],
    ]);
    expect(tx.ledgerEntry.create.mock.calls[1]![0].data.sourceType).toBe("EXPENSE_SETTLEMENT");
    expect(tx.ledgerEntry.create.mock.calls[1]![0].data.sourceId).toBe("expense-settlement-1");
    expect(tx.ledgerEntry.create.mock.calls[2]![0].data.sourceType).toBe("PAYMENT_APPLICATION");
    expect(tx.ledgerEntry.create.mock.calls[2]![0].data.sourceId).toBe("application-1");
  });

  it("records two partial settlements against the same expense as two distinct ledger entries", async () => {
    const tx = transaction();
    const common = { tx: tx as never, organizationId: "org-1", entryDate: new Date(), currency: "TRY" };
    await recordExpenseSettlementApplication({ ...common, expenseSettlementId: "expense-settlement-1", amount: "100.00" });
    await recordExpenseSettlementApplication({ ...common, expenseSettlementId: "expense-settlement-2", amount: "150.00" });
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.ledgerEntry.create.mock.calls[0]![0].data.sourceId).toBe("expense-settlement-1");
    expect(tx.ledgerEntry.create.mock.calls[1]![0].data.sourceId).toBe("expense-settlement-2");
  });

  it("records two partial applications against the same payment as two distinct ledger entries", async () => {
    const tx = transaction();
    const common = { tx: tx as never, organizationId: "org-1", entryDate: new Date(), currency: "TRY" };
    await recordPaymentApplication({ ...common, applicationId: "application-1", amount: "100.00" });
    await recordPaymentApplication({ ...common, applicationId: "application-2", amount: "150.00" });
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.ledgerEntry.create.mock.calls[0]![0].data.sourceId).toBe("application-1");
    expect(tx.ledgerEntry.create.mock.calls[1]![0].data.sourceId).toBe("application-2");
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

  it("is replay-safe: a duplicate posting attempt for the same (sourceType, sourceId) returns the existing entry instead of throwing", async () => {
    const tx = transaction();
    const existing = { id: "entry-existing", sourceType: "PAYMENT_APPLICATION", sourceId: "application-1", lines: [] };
    tx.ledgerEntry.create.mockRejectedValueOnce(p2002());
    tx.ledgerEntry.findFirst.mockResolvedValueOnce(existing);

    const result = await recordPaymentApplication({ tx: tx as never, organizationId: "org-1", applicationId: "application-1", entryDate: new Date(), amount: "100.00", currency: "TRY" });

    expect(result).toBe(existing);
    expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", sourceType: "PAYMENT_APPLICATION", sourceId: "application-1" }) }));
  });

  it("LEDGER REPLAY SAFETY: is replay-safe for EXPENSE_SETTLEMENT specifically — a duplicate posting for the same expenseSettlementId returns the existing entry instead of throwing", async () => {
    const tx = transaction();
    const existing = { id: "entry-existing", sourceType: "EXPENSE_SETTLEMENT", sourceId: "expense-settlement-1", lines: [] };
    tx.ledgerEntry.create.mockRejectedValueOnce(p2002());
    tx.ledgerEntry.findFirst.mockResolvedValueOnce(existing);

    const result = await recordExpenseSettlementApplication({ tx: tx as never, organizationId: "org-1", expenseSettlementId: "expense-settlement-1", entryDate: new Date(), amount: "100.00", currency: "TRY" });

    expect(result).toBe(existing);
    expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", sourceType: "EXPENSE_SETTLEMENT", sourceId: "expense-settlement-1" }) }));
  });

  it("propagates a non-P2002 error untouched instead of masking it as a replay", async () => {
    const tx = transaction();
    tx.ledgerEntry.create.mockRejectedValueOnce(new Error("connection lost"));
    await expect(recordPaymentApplication({ tx: tx as never, organizationId: "org-1", applicationId: "application-1", entryDate: new Date(), amount: "100.00", currency: "TRY" })).rejects.toThrow("connection lost");
    expect(tx.ledgerEntry.findFirst).not.toHaveBeenCalled();
  });

  it("re-throws the P2002 if no matching existing entry can be found", async () => {
    const tx = transaction();
    tx.ledgerEntry.create.mockRejectedValueOnce(p2002());
    tx.ledgerEntry.findFirst.mockResolvedValueOnce(null);
    await expect(recordPaymentApplication({ tx: tx as never, organizationId: "org-1", applicationId: "application-1", entryDate: new Date(), amount: "100.00", currency: "TRY" })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});

function sum(lines: Array<Record<string, bigint>>, key: "debitCents" | "creditCents") {
  return lines.reduce((total, line) => total + line[key]!, BigInt(0));
}
