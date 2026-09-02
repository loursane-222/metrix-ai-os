import { describe, expect, it, vi } from "vitest";
import {
  listActiveCustomers,
  readCommercialTermsForCustomer,
  readConfirmedOrdersForCustomer,
  readConfirmedOrdersInRange,
  readQuotesForCustomer,
  readQuotesSentInRange,
  resolveCompanyQueryDateRange,
} from "../company-query-readers";

const now = new Date("2026-09-02T09:00:00.000Z");
const window = { start: new Date("2026-06-04T00:00:00.000Z"), end: new Date("2026-09-02T09:00:00.000Z") };

describe("company query readers — tenant isolation (organizationId always in the where clause)", () => {
  it("listActiveCustomers scopes to organizationId and ACTIVE status only", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await listActiveCustomers("org-1", { customer: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", status: "ACTIVE" } }));
  });

  it("readQuotesSentInRange scopes to organizationId and the sentAt window", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readQuotesSentInRange("org-1", window, { quote: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", sentAt: { gte: window.start, lt: window.end } } }));
  });

  it("readConfirmedOrdersInRange scopes to organizationId and the confirmedAt window", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readConfirmedOrdersInRange("org-1", window, { order: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", confirmedAt: { gte: window.start, lt: window.end } } }));
  });

  it("readQuotesForCustomer scopes to both organizationId and customerId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readQuotesForCustomer("org-1", "cust-1", null, { quote: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", customerId: "cust-1" } }));
  });

  it("readConfirmedOrdersForCustomer scopes to both organizationId and customerId, defaulting to all-time confirmed when no window is given", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readConfirmedOrdersForCustomer("org-1", "cust-1", null, { order: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", customerId: "cust-1", confirmedAt: { not: null } } }));
  });

  it("readCommercialTermsForCustomer scopes to both organizationId and customerId", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await readCommercialTermsForCustomer("org-1", "cust-1", { customerCommercialTerms: { findFirst } });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", customerId: "cust-1" } }));
  });
});

describe("company query readers — row mapping correctness", () => {
  it("drops quote rows with no customer instead of joining them under a fake id", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "q1", customerId: null, customer: null, status: "DRAFT", amount: null, currency: "TRY", sentAt: null, wonAt: null, lostAt: null, createdAt: now },
      { id: "q2", customerId: "cust-1", customer: { displayName: "Atlas" }, status: "SENT", amount: "1000.5", currency: "TRY", sentAt: now, wonAt: null, lostAt: null, createdAt: now },
    ]);
    const rows = await readQuotesSentInRange("org-1", window, { quote: { findMany } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "q2", customerId: "cust-1", customerName: "Atlas", amount: 1000.5 });
  });

  it("converts confirmedValueCents (bigint-as-string from prisma) to a stable string, preserving null distinctly from zero", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "o1", customerId: "cust-1", status: "APPROVED", confirmedAt: now, confirmedValueCents: BigInt(12345), confirmationCurrency: "TRY", currency: "TRY" },
      { id: "o2", customerId: "cust-1", status: "APPROVED", confirmedAt: now, confirmedValueCents: null, confirmationCurrency: null, currency: "USD" },
      { id: "o3", customerId: "cust-1", status: "DRAFT", confirmedAt: null, confirmedValueCents: null, confirmationCurrency: null, currency: "TRY" },
    ]);
    const rows = await readConfirmedOrdersInRange("org-1", window, { order: { findMany } });
    // o3 has no confirmedAt (not actually confirmed) — must be dropped, not
    // treated as a confirmed order truth violation.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "o1", confirmedValueCents: "12345", currency: "TRY" });
    expect(rows[1]).toMatchObject({ id: "o2", confirmedValueCents: null, currency: "USD" });
  });

  it("prefers confirmationCurrency over the order's own currency, matching the existing commercial-performance builders' convention", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "o1", customerId: "cust-1", status: "APPROVED", confirmedAt: now, confirmedValueCents: BigInt(100), confirmationCurrency: "USD", currency: "TRY" },
    ]);
    const rows = await readConfirmedOrdersInRange("org-1", window, { order: { findMany } });
    expect(rows[0].currency).toBe("USD");
  });
});

describe("resolveCompanyQueryDateRange — deterministic, model never computes an absolute date", () => {
  it("LAST_N_DAYS resolves to a real rolling window ending at `now`", () => {
    const range = resolveCompanyQueryDateRange({ kind: "LAST_N_DAYS", days: 90 }, now, "Europe/Istanbul");
    expect(range.end.getTime()).toBe(now.getTime());
    expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    // 90 days is roughly 90*86400000 ms before `now`, allowing for local-time DST snapping.
    const approxMs = 90 * 86_400_000;
    expect(Math.abs((range.end.getTime() - range.start.getTime()) - approxMs)).toBeLessThan(2 * 86_400_000);
  });

  it("CURRENT_MONTH and PREVIOUS_MONTH resolve via the existing management-period resolver (no duplicated date math)", () => {
    const current = resolveCompanyQueryDateRange({ kind: "CURRENT_MONTH" }, now, "Europe/Istanbul");
    const previous = resolveCompanyQueryDateRange({ kind: "PREVIOUS_MONTH" }, now, "Europe/Istanbul");
    expect(current.start.getTime()).toBeLessThan(current.end.getTime());
    expect(previous.end.getTime()).toBeLessThanOrEqual(current.start.getTime());
  });
});
