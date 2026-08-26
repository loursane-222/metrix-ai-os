import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateWorkCenterDetailsMock, getWorkCenterByIdForOrganizationMock } = vi.hoisted(() => ({
  updateWorkCenterDetailsMock: vi.fn(),
  getWorkCenterByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/production/production.service", () => ({
  updateWorkCenterDetails: updateWorkCenterDetailsMock,
  getWorkCenterByIdForOrganization: getWorkCenterByIdForOrganizationMock,
}));

import { workCenterArchiveHandler } from "../work-center-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "workCenter.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("workCenterArchiveHandler", () => {
  beforeEach(() => {
    updateWorkCenterDetailsMock.mockReset();
    getWorkCenterByIdForOrganizationMock.mockReset();
  });

  it("archives the addressed work center through the canonical service", async () => {
    getWorkCenterByIdForOrganizationMock.mockResolvedValue({ id: "wc1", status: "ACTIVE" });
    updateWorkCenterDetailsMock.mockResolvedValue({ id: "wc1", status: "INACTIVE" });

    const result = await workCenterArchiveHandler(envelope({ workCenterId: "wc1" }));

    expect(updateWorkCenterDetailsMock).toHaveBeenCalledWith({ id: "wc1", organizationId: "org-1", status: "INACTIVE" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "workCenter", entityId: "wc1" } });
  });

  it("reports NO_CHANGE without a second mutation when already inactive", async () => {
    getWorkCenterByIdForOrganizationMock.mockResolvedValue({ id: "wc1", status: "INACTIVE" });

    const result = await workCenterArchiveHandler(envelope({ workCenterId: "wc1" }));

    expect(updateWorkCenterDetailsMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing workCenterId before mutation", async () => {
    await expect(workCenterArchiveHandler(envelope({}))).rejects.toThrow(/workCenterId/);
    expect(updateWorkCenterDetailsMock).not.toHaveBeenCalled();
  });
});
