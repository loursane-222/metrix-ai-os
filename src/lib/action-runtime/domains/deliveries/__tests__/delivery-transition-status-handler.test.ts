import { beforeEach, describe, expect, it, vi } from "vitest";

const { transitionDeliveryStatusMock, getDeliveryByIdForOrganizationMock, notifyWithOwnerFanoutMock } = vi.hoisted(() => ({
  transitionDeliveryStatusMock: vi.fn(),
  getDeliveryByIdForOrganizationMock: vi.fn(),
  notifyWithOwnerFanoutMock: vi.fn(),
}));
vi.mock("@/lib/core/deliveries/delivery.service", () => ({
  transitionDeliveryStatus: transitionDeliveryStatusMock,
  getDeliveryByIdForOrganization: getDeliveryByIdForOrganizationMock,
}));
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: notifyWithOwnerFanoutMock }));

import { handleDeliveryTransitionStatus } from "../delivery-transition-status-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "delivery.transitionStatus",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["deliveries.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleDeliveryTransitionStatus", () => {
  beforeEach(() => {
    transitionDeliveryStatusMock.mockReset();
    getDeliveryByIdForOrganizationMock.mockReset();
    getDeliveryByIdForOrganizationMock.mockResolvedValue({ id: "delivery-1", status: "DRAFT" });
    notifyWithOwnerFanoutMock.mockReset();
    notifyWithOwnerFanoutMock.mockResolvedValue({ notifications: [], additionalTargetResolutions: [] });
  });

  it("transitions the addressed delivery through the canonical service", async () => {
    transitionDeliveryStatusMock.mockResolvedValue({ id: "delivery-1", status: "PREPARING" });

    const result = await handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "PREPARING" }));

    expect(transitionDeliveryStatusMock).toHaveBeenCalledWith({ deliveryId: "delivery-1", organizationId: "org-1", toStatus: "PREPARING", reason: undefined, performedById: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "delivery", entityId: "delivery-1" } });
  });

  it("rejects an unknown status value before mutation", async () => {
    await expect(handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "MADE_UP" }))).rejects.toThrow(/toStatus/);
    expect(transitionDeliveryStatusMock).not.toHaveBeenCalled();
  });

  it("rejects a missing deliveryId before mutation", async () => {
    await expect(handleDeliveryTransitionStatus(envelope({ toStatus: "PREPARING" }))).rejects.toThrow(/deliveryId/);
    expect(transitionDeliveryStatusMock).not.toHaveBeenCalled();
  });

  it("rejects when the delivery does not exist in this organization", async () => {
    getDeliveryByIdForOrganizationMock.mockResolvedValue(null);

    await expect(handleDeliveryTransitionStatus(envelope({ deliveryId: "missing", toStatus: "PREPARING" }))).rejects.toThrow(/not found/i);
    expect(transitionDeliveryStatusMock).not.toHaveBeenCalled();
  });

  // Regression: delivery.transitionStatus is self-compensating — a failed
  // later step in the same orchestration reverses it by transitioning back
  // to the pre-transition status.
  it("builds a compensationSnapshot that transitions back to the pre-change status", async () => {
    transitionDeliveryStatusMock.mockResolvedValue({ id: "delivery-1", status: "PREPARING" });

    const result = await handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "PREPARING" }));

    expect(result.compensationSnapshot).toEqual({ deliveryId: "delivery-1", toStatus: "DRAFT", reason: expect.any(String) });
  });

  it("proactively notifies the owner when a delivery fails", async () => {
    transitionDeliveryStatusMock.mockResolvedValue({ id: "delivery-1", deliveryNumber: "DEL-2026-001", status: "FAILED_DELIVERY" });

    const result = await handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "FAILED_DELIVERY" }));

    expect(notifyWithOwnerFanoutMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      type: "delivery.failed",
      body: expect.stringContaining("DEL-2026-001"),
      severity: "WARNING",
    }));
    expect(result.metadata).toMatchObject({ notificationDelivered: true });
  });

  it("does not notify for a transition other than FAILED_DELIVERY", async () => {
    transitionDeliveryStatusMock.mockResolvedValue({ id: "delivery-1", status: "PREPARING" });

    await handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "PREPARING" }));

    expect(notifyWithOwnerFanoutMock).not.toHaveBeenCalled();
  });

  it("reports SUCCESS and records the failure instead of throwing when the failed-delivery notification breaks", async () => {
    transitionDeliveryStatusMock.mockResolvedValue({ id: "delivery-1", deliveryNumber: "DEL-2026-001", status: "FAILED_DELIVERY" });
    notifyWithOwnerFanoutMock.mockRejectedValue(new Error("notification channel unavailable"));

    const result = await handleDeliveryTransitionStatus(envelope({ deliveryId: "delivery-1", toStatus: "FAILED_DELIVERY" }));

    expect(result.status).toBe("SUCCESS");
    expect(result.metadata).toMatchObject({ notificationDelivered: false });
  });
});
