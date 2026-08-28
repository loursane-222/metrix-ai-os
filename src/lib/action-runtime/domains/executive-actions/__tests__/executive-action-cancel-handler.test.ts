import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { cancelExecutiveActionMock, findExecutiveActionByIdForOrganizationMock } = vi.hoisted(() => ({
  cancelExecutiveActionMock: vi.fn(),
  findExecutiveActionByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/executive-actions/executive-action-engine.service", () => ({
  cancelExecutiveAction: cancelExecutiveActionMock,
  findExecutiveActionByIdForOrganization: findExecutiveActionByIdForOrganizationMock,
}));

import { executiveActionCancelHandler } from "../executive-action-cancel-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "executive_action.cancel",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["executive_actions.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("executiveActionCancelHandler", () => {
  beforeEach(() => {
    cancelExecutiveActionMock.mockReset();
    findExecutiveActionByIdForOrganizationMock.mockReset();
  });

  it("cancels the addressed executive action through the canonical service", async () => {
    findExecutiveActionByIdForOrganizationMock.mockResolvedValue({ id: "ea1", status: "OPEN" });
    cancelExecutiveActionMock.mockResolvedValue({ id: "ea1", status: "CANCELLED" });

    const result = await executiveActionCancelHandler(envelope({ executiveActionId: "ea1" }));

    expect(cancelExecutiveActionMock).toHaveBeenCalledWith({ id: "ea1", organizationId: "org-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "executive_action", entityId: "ea1" } });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    findExecutiveActionByIdForOrganizationMock.mockResolvedValue({ id: "ea1", status: "CANCELLED" });

    const result = await executiveActionCancelHandler(envelope({ executiveActionId: "ea1" }));

    expect(cancelExecutiveActionMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing executiveActionId before mutation", async () => {
    await expect(executiveActionCancelHandler(envelope({}))).rejects.toThrow(/executiveActionId/);
    expect(cancelExecutiveActionMock).not.toHaveBeenCalled();
  });
});
