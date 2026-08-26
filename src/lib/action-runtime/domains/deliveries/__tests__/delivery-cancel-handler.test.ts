import { beforeEach, describe, expect, it, vi } from "vitest";

const { cancelDeliveryMock } = vi.hoisted(() => ({ cancelDeliveryMock: vi.fn() }));
vi.mock("@/lib/core/deliveries/delivery.service", () => ({ cancelDelivery: cancelDeliveryMock }));

import { handleDeliveryCancel } from "../delivery-cancel-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "delivery.cancel",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["deliveries.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleDeliveryCancel", () => {
  beforeEach(() => cancelDeliveryMock.mockReset());

  it("cancels the addressed delivery through the canonical service", async () => {
    cancelDeliveryMock.mockResolvedValue({ id: "d1", status: "CANCELLED" });

    const result = await handleDeliveryCancel(envelope({ deliveryId: "d1", reason: "otomatik geri alma" }));

    expect(cancelDeliveryMock).toHaveBeenCalledWith({ deliveryId: "d1", organizationId: "org-1", reason: "otomatik geri alma", performedById: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "delivery", entityId: "d1" } });
  });

  it("rejects a missing deliveryId before mutation", async () => {
    await expect(handleDeliveryCancel(envelope({ reason: "x" }))).rejects.toThrow(/deliveryId/);
    expect(cancelDeliveryMock).not.toHaveBeenCalled();
  });

  it("rejects a missing reason before mutation", async () => {
    await expect(handleDeliveryCancel(envelope({ deliveryId: "d1" }))).rejects.toThrow(/reason/);
    expect(cancelDeliveryMock).not.toHaveBeenCalled();
  });
});
