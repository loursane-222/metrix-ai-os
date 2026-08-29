import { beforeEach, describe, expect, it, vi } from "vitest";

const { findActivePersonMonthlyGoalsMock, listDistinctPersonGoalOwnersMock, listFieldVisitsMock, listPaymentsMock, quoteFindManyMock } = vi.hoisted(() => ({
  findActivePersonMonthlyGoalsMock: vi.fn(),
  listDistinctPersonGoalOwnersMock: vi.fn(),
  listFieldVisitsMock: vi.fn(),
  listPaymentsMock: vi.fn(),
  quoteFindManyMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { quote: { findMany: quoteFindManyMock } } }));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ listFieldVisits: listFieldVisitsMock }));
vi.mock("@/lib/core/payments/payment.service", () => ({ listPayments: listPaymentsMock }));
vi.mock("../rep-goal.repository", async () => {
  const actual = await vi.importActual<typeof import("../rep-goal.repository")>("../rep-goal.repository");
  return { ...actual, findActivePersonMonthlyGoals: findActivePersonMonthlyGoalsMock, listDistinctPersonGoalOwners: listDistinctPersonGoalOwnersMock };
});

import { resolveRepGoalAchievement, resolveTeamGoalAchievement } from "../rep-goal-achievement.service";

const REFERENCE = new Date("2026-08-15T12:00:00.000Z");

function visit(overrides: Record<string, unknown> = {}) {
  return { id: "v1", relatedPaymentId: null, ...overrides };
}

describe("resolveRepGoalAchievement", () => {
  beforeEach(() => {
    findActivePersonMonthlyGoalsMock.mockReset();
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
    listPaymentsMock.mockReset().mockResolvedValue([]);
    quoteFindManyMock.mockReset().mockResolvedValue([]);
  });

  it("returns null when the rep has no active personal goal this month", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([]);
    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);
    expect(result).toBeNull();
  });

  it("computes visitActual from this month's FieldVisit count against the ACTIVITY target", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([{ goalType: "ACTIVITY", targetValue: "20" }]);
    listFieldVisitsMock.mockResolvedValue([visit({ id: "v1" }), visit({ id: "v2" }), visit({ id: "v3" })]);

    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);

    expect(result).toMatchObject({ visitTarget: 20, visitActual: 3, salesTarget: null, collectionTarget: null });
    expect(listFieldVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", repUserId: "user-2" }));
  });

  it("computes salesActual from this month's WON quotes created by the rep", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([{ goalType: "SALES", targetRevenueCents: BigInt(50000000) }]);
    quoteFindManyMock.mockResolvedValue([{ amount: 120000 }, { amount: 80000 }]);

    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);

    expect(result).toMatchObject({ salesTarget: 500000, salesActual: 200000 });
    expect(quoteFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1", createdByUserId: "user-2", status: "WON" }),
    }));
  });

  it("computes collectionActual only from PAID payments linked to this month's visits", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([{ goalType: "COLLECTION", targetCollectionCents: BigInt(30000000) }]);
    listFieldVisitsMock.mockResolvedValue([visit({ id: "v1", relatedPaymentId: "pay-1" }), visit({ id: "v2", relatedPaymentId: "pay-2" })]);
    listPaymentsMock.mockResolvedValue([
      { id: "pay-1", status: "PAID", paidAt: new Date("2026-08-10T00:00:00.000Z"), paidAmount: 100000 },
      { id: "pay-2", status: "PENDING", paidAt: null, paidAmount: 0 },
      { id: "pay-3", status: "PAID", paidAt: new Date("2026-08-05T00:00:00.000Z"), paidAmount: 999999 },
    ]);

    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);

    expect(result).toMatchObject({ collectionTarget: 300000, collectionActual: 100000 });
  });

  it("never calls listPayments when no visit links a payment", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([{ goalType: "ACTIVITY", targetValue: "10" }]);
    listFieldVisitsMock.mockResolvedValue([visit()]);
    await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);
    expect(listPaymentsMock).not.toHaveBeenCalled();
  });

  it("excludes a PAID payment whose paidAt falls outside the current month", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([{ goalType: "COLLECTION", targetCollectionCents: BigInt(10000000) }]);
    listFieldVisitsMock.mockResolvedValue([visit({ id: "v1", relatedPaymentId: "pay-1" })]);
    listPaymentsMock.mockResolvedValue([{ id: "pay-1", status: "PAID", paidAt: new Date("2026-07-31T00:00:00.000Z"), paidAmount: 50000 }]);

    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);
    expect(result).toMatchObject({ collectionActual: 0 });
  });

  it("returns all three targets together when all three goals are active", async () => {
    findActivePersonMonthlyGoalsMock.mockResolvedValue([
      { goalType: "ACTIVITY", targetValue: "20" },
      { goalType: "SALES", targetRevenueCents: BigInt(50000000) },
      { goalType: "COLLECTION", targetCollectionCents: BigInt(30000000) },
    ]);

    const result = await resolveRepGoalAchievement("org-1", "user-2", REFERENCE);
    expect(result).toMatchObject({ visitTarget: 20, salesTarget: 500000, collectionTarget: 300000 });
  });
});

describe("resolveTeamGoalAchievement", () => {
  beforeEach(() => {
    listDistinctPersonGoalOwnersMock.mockReset();
    findActivePersonMonthlyGoalsMock.mockReset();
    listFieldVisitsMock.mockReset().mockResolvedValue([]);
    listPaymentsMock.mockReset().mockResolvedValue([]);
    quoteFindManyMock.mockReset().mockResolvedValue([]);
  });

  it("returns null when no rep in the org has any active goal this month", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue([]);
    const result = await resolveTeamGoalAchievement("org-1", REFERENCE);
    expect(result).toBeNull();
    expect(findActivePersonMonthlyGoalsMock).not.toHaveBeenCalled();
  });

  it("sums targets and actuals across every rep who has a goal, and counts them", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2", "user-3"]);
    findActivePersonMonthlyGoalsMock.mockImplementation(async (input: { ownerUserId: string }) =>
      input.ownerUserId === "user-2"
        ? [{ goalType: "ACTIVITY", targetValue: "20" }]
        : [{ goalType: "ACTIVITY", targetValue: "10" }]);
    listFieldVisitsMock.mockImplementation(async (input: { repUserId: string }) =>
      input.repUserId === "user-2" ? [visit(), visit()] : [visit()]);

    const result = await resolveTeamGoalAchievement("org-1", REFERENCE);

    expect(result).toEqual({
      repCount: 2,
      visitTarget: 30, visitActual: 3,
      salesTarget: null, salesActual: 0,
      collectionTarget: null, collectionActual: 0,
    });
  });

  it("excludes a rep whose own achievement resolves to null from the count and sums", async () => {
    listDistinctPersonGoalOwnersMock.mockResolvedValue(["user-2", "user-3"]);
    // user-3 slipped through listDistinctPersonGoalOwners but has since lost
    // its active goal by the time resolveRepGoalAchievement re-checks —
    // defensive consistency, shouldn't happen in practice but must not crash.
    findActivePersonMonthlyGoalsMock.mockImplementation(async (input: { ownerUserId: string }) =>
      input.ownerUserId === "user-2" ? [{ goalType: "ACTIVITY", targetValue: "20" }] : []);

    const result = await resolveTeamGoalAchievement("org-1", REFERENCE);
    expect(result).toMatchObject({ repCount: 1, visitTarget: 20 });
  });
});
