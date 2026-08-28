import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { createNewWarehouseMock } = vi.hoisted(() => ({ createNewWarehouseMock: vi.fn() }));
vi.mock("@/lib/core/stock/stock.service", () => ({ createNewWarehouse: createNewWarehouseMock }));

import { handleWarehouseCreate } from "../warehouse-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "warehouse.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleWarehouseCreate", () => {
  beforeEach(() => createNewWarehouseMock.mockReset());

  it("creates a warehouse through the canonical service", async () => {
    createNewWarehouseMock.mockResolvedValue({ id: "wh-1", name: "Merkez Depo" });

    const result = await handleWarehouseCreate(envelope({ name: "Merkez Depo", code: "WH-1" }));

    expect(createNewWarehouseMock).toHaveBeenCalledWith({ organizationId: "org-1", name: "Merkez Depo", code: "WH-1", type: undefined, address: undefined, notes: undefined });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "warehouse", entityId: "wh-1" } });
  });

  it("rejects a missing code before mutation", async () => {
    await expect(handleWarehouseCreate(envelope({ name: "Merkez Depo" }))).rejects.toThrow(/code/);
    expect(createNewWarehouseMock).not.toHaveBeenCalled();
  });
});
