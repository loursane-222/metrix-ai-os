import { beforeEach, describe, expect, it, vi } from "vitest";

const { createNewSalesGoalMock } = vi.hoisted(() => ({ createNewSalesGoalMock: vi.fn() }));
vi.mock("@/lib/core/goals/goal.service", () => ({ createNewSalesGoal: createNewSalesGoalMock }));

import { goalCreateHandler } from "../goal-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "goal.create",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["goals.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("goalCreateHandler", () => {
  beforeEach(() => {
    createNewSalesGoalMock.mockReset();
  });

  it("creates a goal through the canonical service with defaults matching the legacy route", async () => {
    createNewSalesGoalMock.mockResolvedValue({ id: "goal-1", title: "Q1 Satış", period: "QUARTERLY" });
    const result = await goalCreateHandler(envelope({ title: "Q1 Satış", period: "QUARTERLY" }));
    expect(createNewSalesGoalMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1", title: "Q1 Satış", period: "QUARTERLY", scope: "COMPANY", goalType: "SALES",
      provenanceJson: { actorUserId: "actor-1", source: "SEMANTIC_AUTHORITY" },
    }));
    expect(result.status).toBe("SUCCESS");
    expect(result.entityRef).toEqual({ entityType: "goal", entityId: "goal-1" });
  });

  it("rejects an invalid period before calling the service", async () => {
    await expect(goalCreateHandler(envelope({ title: "X", period: "WEEKLY" }))).rejects.toThrow(/period/);
    expect(createNewSalesGoalMock).not.toHaveBeenCalled();
  });

  it("rejects a missing title", async () => {
    await expect(goalCreateHandler(envelope({ period: "MONTHLY" }))).rejects.toThrow(/title/);
  });
});
