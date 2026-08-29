import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, updateMock, createMock, findManyMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { salesGoal: { findFirst: findFirstMock, update: updateMock, create: createMock, findMany: findManyMock } },
}));

import { currentMonthBounds, findActivePersonMonthlyGoals, listDistinctPersonGoalOwners, upsertPersonMonthlyGoal } from "../rep-goal.repository";

const REFERENCE = new Date("2026-08-15T12:00:00.000Z");

describe("currentMonthBounds", () => {
  it("returns the first-of-month UTC start and the first-of-next-month UTC end", () => {
    const bounds = currentMonthBounds(REFERENCE);
    expect(bounds.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("upsertPersonMonthlyGoal", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    updateMock.mockReset().mockResolvedValue({ id: "goal-updated" });
    createMock.mockReset().mockResolvedValue({ id: "goal-created" });
  });

  it("creates a new ACTIVITY goal with targetValue when none exists yet this month", async () => {
    findFirstMock.mockResolvedValue(null);
    await upsertPersonMonthlyGoal({ organizationId: "org-1", ownerUserId: "user-2", goalType: "ACTIVITY", title: "Ahmet — Aylık Hedef", amount: 20, reference: REFERENCE });

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org-1", ownerUserId: "user-2", scope: "PERSON", period: "MONTHLY", goalType: "ACTIVITY",
        startsAt: new Date("2026-08-01T00:00:00.000Z"), endsAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    }));
    const data = createMock.mock.calls[0]![0].data;
    expect(data.targetValue.toString()).toBe("20");
  });

  it("creates a SALES goal with targetRevenueCents converted from a TL amount", async () => {
    findFirstMock.mockResolvedValue(null);
    await upsertPersonMonthlyGoal({ organizationId: "org-1", ownerUserId: "user-2", goalType: "SALES", title: "x", amount: 500000, reference: REFERENCE });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetRevenueCents: BigInt(50000000) }) }));
  });

  it("creates a COLLECTION goal with targetCollectionCents converted from a TL amount", async () => {
    findFirstMock.mockResolvedValue(null);
    await upsertPersonMonthlyGoal({ organizationId: "org-1", ownerUserId: "user-2", goalType: "COLLECTION", title: "x", amount: 300000, reference: REFERENCE });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetCollectionCents: BigInt(30000000) }) }));
  });

  it("updates the existing active goal for this rep/type/month instead of creating a duplicate", async () => {
    findFirstMock.mockResolvedValue({ id: "existing-goal" });
    await upsertPersonMonthlyGoal({ organizationId: "org-1", ownerUserId: "user-2", goalType: "ACTIVITY", title: "Ahmet — Aylık Hedef", amount: 25, reference: REFERENCE });

    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "existing-goal", organizationId: "org-1" },
      data: expect.objectContaining({ title: "Ahmet — Aylık Hedef" }),
    });
  });

  it("scopes the existing-goal lookup to this org/rep/type/month/ACTIVE status", async () => {
    findFirstMock.mockResolvedValue(null);
    await upsertPersonMonthlyGoal({ organizationId: "org-1", ownerUserId: "user-2", goalType: "SALES", title: "x", amount: 1, reference: REFERENCE });
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1", ownerUserId: "user-2", scope: "PERSON", period: "MONTHLY",
        goalType: "SALES", status: "ACTIVE", startsAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  });
});

describe("findActivePersonMonthlyGoals", () => {
  it("queries this org/rep's ACTIVE PERSON MONTHLY goals for the current month", async () => {
    findManyMock.mockReset().mockResolvedValue([]);
    await findActivePersonMonthlyGoals({ organizationId: "org-1", ownerUserId: "user-2", reference: REFERENCE });
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1", ownerUserId: "user-2", scope: "PERSON", period: "MONTHLY",
        status: "ACTIVE", startsAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  });
});

describe("listDistinctPersonGoalOwners", () => {
  it("returns the distinct ownerUserIds with an active PERSON MONTHLY goal this month", async () => {
    findManyMock.mockReset().mockResolvedValue([{ ownerUserId: "user-2" }, { ownerUserId: "user-3" }]);
    const result = await listDistinctPersonGoalOwners({ organizationId: "org-1", reference: REFERENCE });

    expect(result).toEqual(["user-2", "user-3"]);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1", scope: "PERSON", period: "MONTHLY", status: "ACTIVE",
        startsAt: new Date("2026-08-01T00:00:00.000Z"), ownerUserId: { not: null },
      },
      select: { ownerUserId: true },
      distinct: ["ownerUserId"],
    });
  });

  it("filters out any null ownerUserId defensively", async () => {
    findManyMock.mockReset().mockResolvedValue([{ ownerUserId: "user-2" }, { ownerUserId: null }]);
    const result = await listDistinctPersonGoalOwners({ organizationId: "org-1", reference: REFERENCE });
    expect(result).toEqual(["user-2"]);
  });
});
