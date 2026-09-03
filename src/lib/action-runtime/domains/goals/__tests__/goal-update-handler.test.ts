import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSalesGoalByIdForOrganizationMock, updateSalesGoalDetailsMock } = vi.hoisted(() => ({
  getSalesGoalByIdForOrganizationMock: vi.fn(),
  updateSalesGoalDetailsMock: vi.fn(),
}));
vi.mock("@/lib/core/goals/goal.service", () => ({
  getSalesGoalByIdForOrganization: getSalesGoalByIdForOrganizationMock,
  updateSalesGoalDetails: updateSalesGoalDetailsMock,
}));

import { goalUpdateHandler } from "../goal-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "goal.update",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["goals.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("goalUpdateHandler", () => {
  beforeEach(() => {
    getSalesGoalByIdForOrganizationMock.mockReset();
    updateSalesGoalDetailsMock.mockReset();
  });

  it("patches only the addressed fields and captures a reverse-patch compensation snapshot", async () => {
    getSalesGoalByIdForOrganizationMock
      .mockResolvedValueOnce({ id: "goal-1", title: "Eski Başlık", status: "ACTIVE", targetRevenueCents: null, targetCollectionCents: null, startsAt: null, endsAt: null })
      .mockResolvedValueOnce({ id: "goal-1", title: "Yeni Başlık", status: "ACTIVE" });
    updateSalesGoalDetailsMock.mockResolvedValue(undefined);

    const result = await goalUpdateHandler(envelope({ goalId: "goal-1", title: "Yeni Başlık" }));

    expect(updateSalesGoalDetailsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "goal-1", organizationId: "org-1", title: "Yeni Başlık" }));
    expect(result.status).toBe("SUCCESS");
    expect(result.metadata?.changedFields).toEqual(["title"]);
    expect(result.compensationSnapshot).toEqual({ goalId: "goal-1", title: "Eski Başlık" });
  });

  it("rejects when the goal does not exist", async () => {
    getSalesGoalByIdForOrganizationMock.mockResolvedValue(null);
    await expect(goalUpdateHandler(envelope({ goalId: "missing", title: "X" }))).rejects.toThrow(/not found/);
    expect(updateSalesGoalDetailsMock).not.toHaveBeenCalled();
  });

  it("rejects when no updatable field is provided", async () => {
    await expect(goalUpdateHandler(envelope({ goalId: "goal-1" }))).rejects.toThrow(/At least one/);
  });

  it("rejects an invalid status", async () => {
    await expect(goalUpdateHandler(envelope({ goalId: "goal-1", status: "PAUSED" }))).rejects.toThrow(/status/);
  });
});
