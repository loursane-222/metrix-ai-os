import { describe, expect, it, vi } from "vitest";
import { Prisma, type InvoiceStatus } from "@prisma/client";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { buildCustomerStatement } from "../customer-statement.service";

describe("customer current-account statement", () => {
  it("uses ledger 120 movements once and keeps a chronological running balance", () => {
    const statement = buildCustomerStatement(
      { id: "customer-1", displayName: "Atlas İnşaat" },
      [{ id: "invoice-1", invoiceNumber: "FTR-1", title: "Satış", totalAmount: new Prisma.Decimal("1200.00"), currency: "TRY", status: "SENT", createdAt: new Date("2026-08-01T09:00:00Z") }],
      [{ id: "payment-1", title: "Tahsilat", amount: new Prisma.Decimal("500.00"), paidAmount: new Prisma.Decimal("500.00"), currency: "TRY", status: "PAID", paidAt: new Date("2026-08-02T09:00:00Z"), createdAt: new Date("2026-08-02T08:00:00Z"), updatedAt: new Date("2026-08-02T09:00:00Z") }],
      [
        entry("invoice-entry", "INVOICE", "invoice-1", "2026-08-01T10:00:00Z", BigInt(120000), BigInt(0)),
        entry("payment-entry", "PAYMENT", "payment-1", "2026-08-02T10:00:00Z", BigInt(0), BigInt(50000)),
      ] as never,
    );
    expect(statement.movements.map((row) => ({ type: row.sourceType, delta: row.balanceDeltaCents, running: row.runningBalanceCents }))).toEqual([
      { type: "INVOICE", delta: "120000", running: "120000" },
      { type: "PAYMENT", delta: "-50000", running: "70000" },
    ]);
    expect(statement.balances).toEqual([{ currency: "TRY", balanceCents: "70000" }]);
    expect(statement.sourceCounts).toEqual({ invoices: 1, payments: 1, ledgerEntries: 2, ledgerMissingMovements: 0 });
  });

  it("keeps pre-ledger records visible and computes an explicit canonical fallback", () => {
    const statement = buildCustomerStatement(
      { id: "customer-1", displayName: "Atlas İnşaat" },
      [{ id: "invoice-old", invoiceNumber: "FTR-OLD", title: "Eski satış", totalAmount: new Prisma.Decimal("1000.00"), currency: "TRY", status: "SENT", createdAt: new Date("2026-07-01T09:00:00Z") }],
      [{ id: "payment-old", title: "Eski kısmi tahsilat", amount: new Prisma.Decimal("500.00"), paidAmount: new Prisma.Decimal("200.00"), currency: "TRY", status: "PARTIAL", paidAt: null, createdAt: new Date("2026-07-02T08:00:00Z"), updatedAt: new Date("2026-07-03T09:00:00Z") }],
      [],
    );
    expect(statement.movements.map((row) => [row.balanceDeltaCents, row.runningBalanceCents, row.ledgerMissing])).toEqual([["100000", "100000", true], ["-20000", "80000", true]]);
    expect(statement.dataQualityNote).toContain("Faz 2 öncesindeki kayıtlar");
  });

  it("does not turn draft or cancelled invoices into receivables without ledger evidence", () => {
    const invoices = (["DRAFT", "CANCELLED"] as InvoiceStatus[]).map((status, index) => ({ id: `invoice-${index}`, invoiceNumber: `FTR-${index}`, title: status, totalAmount: new Prisma.Decimal("1200.00"), currency: "TRY", status, createdAt: new Date(`2026-08-0${index + 1}T09:00:00Z`) }));
    const statement = buildCustomerStatement({ id: "customer-1", displayName: "Atlas" }, invoices, [], []);
    expect(statement.movements.every((row) => row.balanceDeltaCents === "0")).toBe(true);
  });
});

function entry(id: string, sourceType: "INVOICE" | "PAYMENT", sourceId: string, date: string, debitCents: bigint, creditCents: bigint) {
  return { id, organizationId: "org-1", entryDate: new Date(date), description: "Defter", sourceType, sourceId, reversalOfId: null, createdAt: new Date(date), lines: [{ id: `${id}-line`, ledgerEntryId: id, accountId: "ledger-account-120", debitCents, creditCents, currency: "TRY", createdAt: new Date(date), account: { id: "ledger-account-120", code: "120", name: "Alıcılar", type: "ASSET", createdAt: new Date(), updatedAt: new Date() } }] };
}
