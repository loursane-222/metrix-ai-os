import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordOrderRevisionMock } = vi.hoisted(() => ({ recordOrderRevisionMock: vi.fn() }));
vi.mock("@/lib/core/orders/order-intelligence.service", () => ({ recordOrderRevision: recordOrderRevisionMock }));

import { handleOrderRevise } from "../order-revise-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "order.revise",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["orders.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleOrderRevise", () => {
  beforeEach(() => recordOrderRevisionMock.mockReset());

  it("records a QUANTITY_CHANGED revision through the exact same canonical service PATCH /api/orders/[orderId] (action: revise) already called", async () => {
    recordOrderRevisionMock.mockResolvedValue({ id: "rev-1" });
    const result = await handleOrderRevise(envelope({ orderId: "o1", changeType: "QUANTITY_CHANGED", orderItemId: "item-1", quantity: 12 }));
    expect(recordOrderRevisionMock).toHaveBeenCalledWith("o1", "org-1", { changeType: "QUANTITY_CHANGED", orderItemId: "item-1", quantity: 12 }, undefined, "user-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "o1" } });
  });

  it("records a DEADLINE_CHANGED revision, parsing deadlineAt into a real Date", async () => {
    recordOrderRevisionMock.mockResolvedValue({ id: "rev-2" });
    await handleOrderRevise(envelope({ orderId: "o1", changeType: "DEADLINE_CHANGED", deadlineAt: "2026-08-01T12:00:00.000Z" }));
    expect(recordOrderRevisionMock).toHaveBeenCalledWith("o1", "org-1", { changeType: "DEADLINE_CHANGED", deadlineAt: new Date("2026-08-01T12:00:00.000Z") }, undefined, "user-1");
  });

  it("rejects an invalid changeType before calling the service", async () => {
    await expect(handleOrderRevise(envelope({ orderId: "o1", changeType: "ITEM_REMOVED", orderItemId: "item-1" }))).rejects.toThrow(/changeType/);
    expect(recordOrderRevisionMock).not.toHaveBeenCalled();
  });

  it("rejects a missing quantity for QUANTITY_CHANGED before calling the service", async () => {
    await expect(handleOrderRevise(envelope({ orderId: "o1", changeType: "QUANTITY_CHANGED", orderItemId: "item-1" }))).rejects.toThrow(/quantity/);
    expect(recordOrderRevisionMock).not.toHaveBeenCalled();
  });
});
