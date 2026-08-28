import { beforeEach, describe, expect, it, vi } from "vitest";

const { listFieldVisitsMock, listPaymentsMock } = vi.hoisted(() => ({
  listFieldVisitsMock: vi.fn(),
  listPaymentsMock: vi.fn(),
}));

vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ listFieldVisits: listFieldVisitsMock }));
vi.mock("@/lib/core/payments/payment.service", () => ({ listPayments: listPaymentsMock }));

import { buildFieldVisitWeeklySummary, resolveFieldVisitWeeklySummaryForRequest, resolveIstanbulWeekBounds } from "../field-visit-weekly-summary.service";

describe("resolveIstanbulWeekBounds", () => {
  it.each([
    ["a Monday", "2026-08-24T05:00:00.000Z", "2026-08-24", "2026-08-30"],
    ["a Wednesday", "2026-08-26T12:00:00.000Z", "2026-08-24", "2026-08-30"],
    ["a Sunday", "2026-08-30T20:00:00.000Z", "2026-08-24", "2026-08-30"],
    // Istanbul is UTC+3 — 2026-08-31T22:00:00Z is 2026-09-01 01:00 local
    // (Tuesday), so it must land in the NEXT week, not the one ending Aug 30.
    ["just past local midnight into the next week", "2026-08-31T22:00:00.000Z", "2026-08-31", "2026-09-06"],
  ])("resolves the Monday-Sunday week for %s", (_label, referenceIso, expectedStart, expectedEnd) => {
    const bounds = resolveIstanbulWeekBounds(new Date(referenceIso));
    expect(bounds.weekStart).toBe(expectedStart);
    expect(bounds.weekEnd).toBe(expectedEnd);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(7 * 86_400_000);
  });

  it("starts the week at Istanbul midnight (21:00 UTC the prior day)", () => {
    const bounds = resolveIstanbulWeekBounds(new Date("2026-08-26T12:00:00.000Z"));
    expect(bounds.start.toISOString()).toBe("2026-08-23T21:00:00.000Z");
  });
});

function visit(overrides: Record<string, unknown> = {}) {
  return {
    id: "visit-1", customerId: "cust-1", customerNameRaw: "Arde Yapı", repUserId: "rep-1",
    requestTypesJson: [], relatedOrderId: null, relatedPaymentId: null, unresolvedIntent: null,
    ...overrides,
  };
}

describe("buildFieldVisitWeeklySummary", () => {
  beforeEach(() => {
    listFieldVisitsMock.mockReset();
    listPaymentsMock.mockReset().mockResolvedValue([]);
  });

  it("aggregates visit count, distinct customers/reps, and request types", async () => {
    listFieldVisitsMock.mockResolvedValue([
      visit({ id: "v1", customerId: "cust-1", repUserId: "rep-1", requestTypesJson: ["DISPLAY_REQUEST"] }),
      visit({ id: "v2", customerId: "cust-2", repUserId: "rep-1", requestTypesJson: ["DISPLAY_REQUEST", "SAMPLE_REQUEST"] }),
      visit({ id: "v3", customerId: "cust-1", repUserId: "rep-2" }),
    ]);

    const summary = await buildFieldVisitWeeklySummary({ organizationId: "org-1", repUserId: "rep-1" });

    expect(summary.visitCount).toBe(3);
    expect(summary.distinctCustomerCount).toBe(2);
    expect(summary.distinctRepCount).toBe(2);
    expect(summary.requestTypeCounts).toEqual({ DISPLAY_REQUEST: 2, SAMPLE_REQUEST: 1, OTHER: 0 });
  });

  it("sums linked payment totals only for payments actually linked from this week's visits", async () => {
    listFieldVisitsMock.mockResolvedValue([
      visit({ id: "v1", relatedPaymentId: "pay-1" }),
      visit({ id: "v2", relatedPaymentId: "pay-2" }),
    ]);
    listPaymentsMock.mockResolvedValue([
      { id: "pay-1", amount: 10000 },
      { id: "pay-2", amount: 5000 },
      { id: "pay-3", amount: 99999 },
    ]);

    const summary = await buildFieldVisitWeeklySummary({ organizationId: "org-1", repUserId: "rep-1" });

    expect(summary.linkedPaymentCount).toBe(2);
    expect(summary.linkedPaymentTotal).toBe(15000);
    expect(listPaymentsMock).toHaveBeenCalledWith("org-1");
  });

  it("never calls listPayments when no visit links a payment", async () => {
    listFieldVisitsMock.mockResolvedValue([visit()]);
    await buildFieldVisitWeeklySummary({ organizationId: "org-1", repUserId: "rep-1" });
    expect(listPaymentsMock).not.toHaveBeenCalled();
  });

  it("counts visits with an open unresolvedIntent", async () => {
    listFieldVisitsMock.mockResolvedValue([
      visit({ id: "v1", unresolvedIntent: "Müşteri eşleşmedi" }),
      visit({ id: "v2" }),
    ]);
    const summary = await buildFieldVisitWeeklySummary({ organizationId: "org-1", repUserId: "rep-1" });
    expect(summary.openUnresolvedIntentCount).toBe(1);
  });

  it("omits repUserId for a team-wide summary and passes that through to listFieldVisits", async () => {
    listFieldVisitsMock.mockResolvedValue([]);
    await buildFieldVisitWeeklySummary({ organizationId: "org-1" });
    expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", repUserId: undefined }));
  });
});

describe("resolveFieldVisitWeeklySummaryForRequest", () => {
  beforeEach(() => {
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
    listPaymentsMock.mockReset().mockResolvedValue([]);
  });

  it("always allows an EMPLOYEE to see their own week", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "user-1", actorRole: "EMPLOYEE", targetRepUserId: "user-1",
    });
    expect(result.status).toBe("ALLOWED");
  });

  it("denies an EMPLOYEE asking for a colleague's week", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "user-1", actorRole: "EMPLOYEE", targetRepUserId: "user-2",
    });
    expect(result).toEqual({ status: "DENIED" });
  });

  it("denies an EMPLOYEE asking for the whole team", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "user-1", actorRole: "EMPLOYEE",
    });
    expect(result).toEqual({ status: "DENIED" });
  });

  it("allows a MANAGER to see a colleague's week", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "mgr-1", actorRole: "MANAGER", targetRepUserId: "user-2",
    });
    expect(result.status).toBe("ALLOWED");
  });

  it("allows an OWNER to see the whole team", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "owner-1", actorRole: "OWNER",
    });
    expect(result.status).toBe("ALLOWED");
  });

  it("allows a TEAM_LEAD to see a colleague's week", async () => {
    const result = await resolveFieldVisitWeeklySummaryForRequest({
      organizationId: "org-1", actorUserId: "lead-1", actorRole: "TEAM_LEAD", targetRepUserId: "user-2",
    });
    expect(result.status).toBe("ALLOWED");
  });
});
