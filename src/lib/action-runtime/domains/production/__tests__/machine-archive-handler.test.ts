import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMachineDetailsMock, getMachineByIdForOrganizationMock } = vi.hoisted(() => ({
  updateMachineDetailsMock: vi.fn(),
  getMachineByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/production/production.service", () => ({
  updateMachineDetails: updateMachineDetailsMock,
  getMachineByIdForOrganization: getMachineByIdForOrganizationMock,
}));

import { machineArchiveHandler } from "../machine-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "machine.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("machineArchiveHandler", () => {
  beforeEach(() => {
    updateMachineDetailsMock.mockReset();
    getMachineByIdForOrganizationMock.mockReset();
  });

  it("retires the addressed machine through the canonical service", async () => {
    getMachineByIdForOrganizationMock.mockResolvedValue({ id: "m1", status: "RUNNING" });
    updateMachineDetailsMock.mockResolvedValue({ id: "m1", status: "RETIRED" });

    const result = await machineArchiveHandler(envelope({ machineId: "m1" }));

    expect(updateMachineDetailsMock).toHaveBeenCalledWith({ id: "m1", organizationId: "org-1", status: "RETIRED" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "machine", entityId: "m1" } });
  });

  it("reports NO_CHANGE without a second mutation when already retired", async () => {
    getMachineByIdForOrganizationMock.mockResolvedValue({ id: "m1", status: "RETIRED" });

    const result = await machineArchiveHandler(envelope({ machineId: "m1" }));

    expect(updateMachineDetailsMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing machineId before mutation", async () => {
    await expect(machineArchiveHandler(envelope({}))).rejects.toThrow(/machineId/);
    expect(updateMachineDetailsMock).not.toHaveBeenCalled();
  });
});
