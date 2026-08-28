import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { updateProductionOrderDetailsMock, getProductionOrderByIdForOrganizationMock } = vi.hoisted(() => ({
  updateProductionOrderDetailsMock: vi.fn(),
  getProductionOrderByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/production/production.service", () => ({
  updateProductionOrderDetails: updateProductionOrderDetailsMock,
  getProductionOrderByIdForOrganization: getProductionOrderByIdForOrganizationMock,
}));

import { handleProductionUpdate } from "../production-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "production.update",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleProductionUpdate", () => {
  beforeEach(() => {
    updateProductionOrderDetailsMock.mockReset();
    getProductionOrderByIdForOrganizationMock.mockReset();
    getProductionOrderByIdForOrganizationMock.mockResolvedValue({ id: "po-1", status: "PLANNED", quantityProduced: 0 });
  });

  it("updates the addressed production order through the canonical service", async () => {
    updateProductionOrderDetailsMock.mockResolvedValue({ id: "po-1", status: "IN_PROGRESS" });

    const result = await handleProductionUpdate(envelope({ productionOrderId: "po-1", status: "IN_PROGRESS", quantityProduced: 10 }));

    expect(updateProductionOrderDetailsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "po-1", organizationId: "org-1", status: "IN_PROGRESS", quantityProduced: 10 }));
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "production_order", entityId: "po-1" } });
  });

  it("rejects an unknown status value before mutation", async () => {
    await expect(handleProductionUpdate(envelope({ productionOrderId: "po-1", status: "FINISHED" }))).rejects.toThrow(/status/);
    expect(updateProductionOrderDetailsMock).not.toHaveBeenCalled();
  });

  // Regression: production.update is a self-compensating action — a failed
  // later step in the same orchestration reverses it by replaying
  // production.update with this exact snapshot.
  it("builds a compensationSnapshot that reverse-patches only the changed fields, with a system-attributed status reason", async () => {
    updateProductionOrderDetailsMock.mockResolvedValue({ id: "po-1", status: "IN_PROGRESS" });

    const result = await handleProductionUpdate(envelope({ productionOrderId: "po-1", status: "IN_PROGRESS", quantityProduced: 10 }));

    expect(result.compensationSnapshot).toEqual({
      productionOrderId: "po-1",
      status: "PLANNED",
      quantityProduced: 0,
      statusChangeReason: expect.any(String),
    });
  });

  it("rejects an update for an unknown production order before mutation", async () => {
    getProductionOrderByIdForOrganizationMock.mockResolvedValue(null);
    await expect(handleProductionUpdate(envelope({ productionOrderId: "missing", status: "IN_PROGRESS" }))).rejects.toThrow(/not found/);
    expect(updateProductionOrderDetailsMock).not.toHaveBeenCalled();
  });
});
