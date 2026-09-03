import { beforeEach, describe, expect, it, vi } from "vitest";

const { archiveSalesGoalByIdMock, getSalesGoalByIdForOrganizationMock } = vi.hoisted(() => ({
  archiveSalesGoalByIdMock: vi.fn(),
  getSalesGoalByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/goals/goal.service", () => ({
  archiveSalesGoalById: archiveSalesGoalByIdMock,
  getSalesGoalByIdForOrganization: getSalesGoalByIdForOrganizationMock,
}));

import { goalArchiveHandler } from "../goal-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "goal.archive",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["goals.archive"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("goalArchiveHandler", () => {
  beforeEach(() => {
    archiveSalesGoalByIdMock.mockReset();
    getSalesGoalByIdForOrganizationMock.mockReset();
  });

  it("archives the addressed goal through the canonical service", async () => {
    getSalesGoalByIdForOrganizationMock.mockResolvedValue({ id: "goal-1", status: "ACTIVE" });
    const result = await goalArchiveHandler(envelope({ goalId: "goal-1" }));
    expect(archiveSalesGoalByIdMock).toHaveBeenCalledWith("goal-1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "goal", entityId: "goal-1" } });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    getSalesGoalByIdForOrganizationMock.mockResolvedValue({ id: "goal-1", status: "CANCELLED" });
    const result = await goalArchiveHandler(envelope({ goalId: "goal-1" }));
    expect(archiveSalesGoalByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects an unknown goalId", async () => {
    getSalesGoalByIdForOrganizationMock.mockResolvedValue(null);
    await expect(goalArchiveHandler(envelope({ goalId: "missing" }))).rejects.toThrow(/not found/);
  });
});
