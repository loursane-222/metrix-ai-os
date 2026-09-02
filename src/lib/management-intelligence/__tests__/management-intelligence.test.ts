import { describe, expect, it, vi } from "vitest";
import { buildCustomerManagementDataset, buildCustomerManagementResponse, buildCurrentOrderOperationsDataset, buildInvoicedActivityDataset, buildInvoicedActivityResponse, buildOperationsManagementDataset, buildOperationsManagementResponse } from "../management-intelligence";

const invoiceReader = (postings: unknown[] = [], invoices: unknown[] = []) => ({ ledgerEntry: { findMany: vi.fn().mockResolvedValue(postings) }, invoice: { findMany: vi.fn().mockResolvedValue(invoices) } });
const operationsReader = (orders: unknown[] = [], tasks: unknown[] = []) => ({ order: { findMany: vi.fn().mockResolvedValue(orders) }, task: { findMany: vi.fn().mockResolvedValue(tasks) } });
const now = new Date("2026-09-15T09:00:00.000Z");

describe("management intelligence canonical datasets", () => {
  it("derives invoiced activity only from tenant-scoped ledger postings with period and reversal truth", async () => {
    const postings = [
      { sourceId: "i1", reversalOfId: null, lines: [{ accountId: "ledger-account-120", debitCents: BigInt(120000), creditCents: BigInt(0), currency: "TRY" }] },
      { sourceId: "i1", reversalOfId: "e1", lines: [{ accountId: "ledger-account-120", debitCents: BigInt(0), creditCents: BigInt(20000), currency: "TRY" }] },
      { sourceId: "i2", reversalOfId: null, lines: [{ accountId: "ledger-account-120", debitCents: BigInt(50000), creditCents: BigInt(0), currency: "USD" }] },
    ];
    const db = invoiceReader(postings, [{ id: "i1", customerId: "c1", customer: { id: "c1", displayName: "Atlas" } }, { id: "i2", customerId: null, customer: null }]);
    const dataset = await buildInvoicedActivityDataset("org-1", { intent: { intent: "INVOICED_ACTIVITY", period: "CURRENT_MONTH" }, now, timeZone: "Europe/Istanbul" }, db);
    expect(db.ledgerEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", sourceType: "INVOICE", entryDate: { gte: new Date("2026-08-31T21:00:00.000Z"), lt: now } } }));
    expect(dataset).toMatchObject({ postingCount: 3, invoiceCount: 2, reversalCount: 1, currencies: [{ currency: "TRY", netPostedCents: "100000" }, { currency: "USD", netPostedCents: "50000" }] });
    expect(dataset.customers.some((row) => row.customerId === null && row.customerName === "Müşterisi belirtilmemiş")).toBe(true);
    expect(buildInvoicedActivityResponse(dataset)).toContain("1 ters kayıt");
  });

  it("keeps known-zero invoiced activity affirmative", async () => {
    const dataset = await buildInvoicedActivityDataset("org-zero", { intent: { intent: "INVOICED_ACTIVITY", period: "CURRENT_MONTH" }, now, timeZone: "Europe/Istanbul" }, invoiceReader());
    expect(buildInvoicedActivityResponse(dataset)).toBe("Eylül 2026 döneminde muhasebeye postalanmış fatura hareketi bulunmuyor.");
  });

  it("builds current order and task workload with local-date overdue boundaries", async () => {
    const db = operationsReader([
      { id: "o1", orderNumber: "S1", status: "IN_PRODUCTION", deadlineAt: new Date("2026-09-14T12:00:00Z"), customerId: "c1", customer: { id: "c1", displayName: "Atlas" } },
      { id: "o2", orderNumber: "S2", status: "READY", deadlineAt: new Date("2026-09-15T12:00:00Z"), customerId: "c1", customer: { id: "c1", displayName: "Atlas" } },
    ], [{ id: "t1", title: "Geçmiş", dueDate: new Date("2026-09-14T12:00:00Z") }, { id: "t2", title: "Bugün", dueDate: new Date("2026-09-15T12:00:00Z") }]);
    const dataset = await buildOperationsManagementDataset("org-1", { now, timeZone: "Europe/Istanbul" }, db);
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", status: { notIn: ["COMPLETED", "CANCELLED"] } } }));
    expect(db.task.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "OPEN" }, select: { id: true, title: true, dueDate: true } });
    expect(dataset).toMatchObject({ openTaskCount: 2, overdueTaskCount: 1, dueTodayTaskCount: 1, orders: { openOrderCount: 2, overdueOrderCount: 1, dueTodayCount: 1 } });
    expect(buildOperationsManagementResponse(dataset)).toContain("2 açık sipariş ve 2 açık görev");
  });

  it("composes customer facts without cross-currency or predictive scoring", () => {
    const receivables = { currencies: [{ currency: "TRY", customers: [{ customerId: "c1", customerName: "Atlas", totalOutstanding: 1000, overdueOutstanding: 250 }] }, { currency: "USD", customers: [{ customerId: "c1", customerName: "Atlas", totalOutstanding: 50, overdueOutstanding: 0 }] }] } as never;
    const pipeline = { customers: [{ customerId: "c1", customerName: "Atlas", quoteCount: 2 }] } as never;
    const orders = { customers: [{ customerId: "c1", customerName: "Atlas", openOrderCount: 1, overdueOrderCount: 0 }] } as never;
    const invoiced = { customers: [{ customerId: "c1", customerName: "Atlas", currencies: [{ currency: "TRY", netPostedCents: "25000" }] }] } as never;
    const dataset = buildCustomerManagementDataset(receivables, pipeline, orders, invoiced);
    expect(dataset.customers[0]).toMatchObject({ customerName: "Atlas", openQuoteCount: 2, openOrderCount: 1, receivables: [{ currency: "TRY", outstanding: 1000 }, { currency: "USD", outstanding: 50 }] });
    const response = buildCustomerManagementResponse(dataset); expect(response).toContain("1.000 TRY"); expect(response).toContain("50 USD"); expect(response).toContain("250 TRY"); expect(response).not.toMatch(/risk|sağlık|değerli/iu);
  });

  it("is deterministic for repeated current order evidence", async () => {
    const rows = [{ id: "o1", orderNumber: "S1", status: "READY", deadlineAt: null, customerId: "c1", customer: { id: "c1", displayName: "Atlas" } }];
    const first = await buildCurrentOrderOperationsDataset("org-1", { now, timeZone: "Europe/Istanbul" }, operationsReader(rows));
    const second = await buildCurrentOrderOperationsDataset("org-1", { now, timeZone: "Europe/Istanbul" }, operationsReader(rows));
    expect(first).toEqual(second);
  });
});
