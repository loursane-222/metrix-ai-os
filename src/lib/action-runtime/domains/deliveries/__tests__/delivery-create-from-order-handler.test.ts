import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { createDeliveryFromOrderMock } = vi.hoisted(() => ({ createDeliveryFromOrderMock: vi.fn() }));
vi.mock("@/lib/core/deliveries/delivery.service", () => ({ createDeliveryFromOrder: createDeliveryFromOrderMock }));

import { handleDeliveryCreateFromOrder } from "../delivery-create-from-order-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "delivery.createFromOrder",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["deliveries.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleDeliveryCreateFromOrder", () => {
  beforeEach(() => createDeliveryFromOrderMock.mockReset());

  it("creates the delivery through the exact same canonical service POST /api/deliveries/from-order already called, auto-deriving customer/items from the order", async () => {
    createDeliveryFromOrderMock.mockResolvedValue({ id: "d1", deliveryNumber: "IRS-0099" });
    const result = await handleDeliveryCreateFromOrder(envelope({ sourceOrderId: "order-1", autoDispatch: true }));
    expect(createDeliveryFromOrderMock).toHaveBeenCalledWith({ organizationId: "org-1", sourceOrderId: "order-1", autoDispatch: true });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "delivery", entityId: "d1" } });
  });

  it("defaults autoDispatch to false when not provided", async () => {
    createDeliveryFromOrderMock.mockResolvedValue({ id: "d1", deliveryNumber: "IRS-0099" });
    await handleDeliveryCreateFromOrder(envelope({ sourceOrderId: "order-1" }));
    expect(createDeliveryFromOrderMock).toHaveBeenCalledWith({ organizationId: "org-1", sourceOrderId: "order-1", autoDispatch: false });
  });

  it("rejects a missing sourceOrderId before calling the service", async () => {
    await expect(handleDeliveryCreateFromOrder(envelope({}))).rejects.toThrow(/sourceOrderId/);
    expect(createDeliveryFromOrderMock).not.toHaveBeenCalled();
  });
});
