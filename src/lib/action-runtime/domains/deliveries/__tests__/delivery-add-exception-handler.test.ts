import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordDeliveryExceptionMock } = vi.hoisted(() => ({ recordDeliveryExceptionMock: vi.fn() }));
vi.mock("@/lib/core/deliveries/delivery-intelligence.service", () => ({ recordDeliveryException: recordDeliveryExceptionMock }));

import { handleDeliveryAddException } from "../delivery-add-exception-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "delivery.addException",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["deliveries.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleDeliveryAddException", () => {
  beforeEach(() => recordDeliveryExceptionMock.mockReset());

  it("records the exception through the exact same canonical service PATCH /api/deliveries/[deliveryId] (action: exception) already called", async () => {
    recordDeliveryExceptionMock.mockResolvedValue({ id: "exc-1" });
    const result = await handleDeliveryAddException(envelope({ deliveryId: "d1", category: "CUSTOMER_NOT_AT_ADDRESS", note: "Müşteri adreste yoktu" }));
    expect(recordDeliveryExceptionMock).toHaveBeenCalledWith("d1", "org-1", "CUSTOMER_NOT_AT_ADDRESS", "Müşteri adreste yoktu", "user-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "delivery", entityId: "d1" }, metadata: { exceptionId: "exc-1" } });
  });

  it("rejects a missing deliveryId before calling the service", async () => {
    await expect(handleDeliveryAddException(envelope({ category: "OTHER" }))).rejects.toThrow(/deliveryId/);
    expect(recordDeliveryExceptionMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid category before calling the service", async () => {
    await expect(handleDeliveryAddException(envelope({ deliveryId: "d1", category: "NOT_A_REAL_CATEGORY" }))).rejects.toThrow(/category/);
    expect(recordDeliveryExceptionMock).not.toHaveBeenCalled();
  });
});
