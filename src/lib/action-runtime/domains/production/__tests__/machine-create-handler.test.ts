import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { createNewMachineMock } = vi.hoisted(() => ({ createNewMachineMock: vi.fn() }));
vi.mock("@/lib/core/production/production.service", () => ({ createNewMachine: createNewMachineMock }));

import { handleMachineCreate } from "../machine-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "machine.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleMachineCreate", () => {
  beforeEach(() => createNewMachineMock.mockReset());

  it("creates a machine under the addressed work center through the canonical service", async () => {
    createNewMachineMock.mockResolvedValue({ id: "m-1", name: "CNC-1" });

    const result = await handleMachineCreate(envelope({ workCenterId: "wc-1", name: "CNC-1", code: "M-1" }));

    expect(createNewMachineMock).toHaveBeenCalledWith({ organizationId: "org-1", workCenterId: "wc-1", name: "CNC-1", code: "M-1", notes: undefined });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "machine", entityId: "m-1" } });
  });

  it("rejects a missing workCenterId before mutation", async () => {
    await expect(handleMachineCreate(envelope({ name: "CNC-1", code: "M-1" }))).rejects.toThrow(/workCenterId/);
    expect(createNewMachineMock).not.toHaveBeenCalled();
  });
});
