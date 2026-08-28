import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { archiveWarehouseByIdMock, getWarehouseByIdForOrganizationMock } = vi.hoisted(() => ({
  archiveWarehouseByIdMock: vi.fn(),
  getWarehouseByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/stock/stock.service", () => ({
  archiveWarehouseById: archiveWarehouseByIdMock,
  getWarehouseByIdForOrganization: getWarehouseByIdForOrganizationMock,
}));

import { warehouseArchiveHandler } from "../warehouse-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "warehouse.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("warehouseArchiveHandler", () => {
  beforeEach(() => {
    archiveWarehouseByIdMock.mockReset();
    getWarehouseByIdForOrganizationMock.mockReset();
  });

  it("archives the addressed warehouse through the canonical service", async () => {
    getWarehouseByIdForOrganizationMock.mockResolvedValue({ id: "w1", status: "ACTIVE" });
    archiveWarehouseByIdMock.mockResolvedValue(undefined);

    const result = await warehouseArchiveHandler(envelope({ warehouseId: "w1" }));

    expect(archiveWarehouseByIdMock).toHaveBeenCalledWith("w1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "warehouse", entityId: "w1" } });
  });

  it("reports NO_CHANGE without a second mutation when the warehouse is already archived", async () => {
    getWarehouseByIdForOrganizationMock.mockResolvedValue({ id: "w1", status: "ARCHIVED" });

    const result = await warehouseArchiveHandler(envelope({ warehouseId: "w1" }));

    expect(archiveWarehouseByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing warehouseId before mutation", async () => {
    await expect(warehouseArchiveHandler(envelope({}))).rejects.toThrow(/warehouseId/);
    expect(archiveWarehouseByIdMock).not.toHaveBeenCalled();
  });
});
