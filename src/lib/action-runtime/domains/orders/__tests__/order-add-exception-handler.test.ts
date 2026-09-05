import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordOrderExceptionMock } = vi.hoisted(() => ({ recordOrderExceptionMock: vi.fn() }));
vi.mock("@/lib/core/orders/order-intelligence.service", () => ({ recordOrderException: recordOrderExceptionMock }));

import { handleOrderAddException } from "../order-add-exception-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "order.addException",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["orders.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleOrderAddException", () => {
  beforeEach(() => recordOrderExceptionMock.mockReset());

  it("records the exception through the exact same canonical service PATCH /api/orders/[orderId] (action: exception) already called", async () => {
    recordOrderExceptionMock.mockResolvedValue({ id: "exc-1" });
    const result = await handleOrderAddException(envelope({ orderId: "o1", category: "SUPPLY_DELAY", note: "Tedarik gecikmesi" }));
    expect(recordOrderExceptionMock).toHaveBeenCalledWith("o1", "org-1", "SUPPLY_DELAY", "Tedarik gecikmesi", "user-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "o1" }, metadata: { exceptionId: "exc-1" } });
  });

  it("rejects a missing orderId before calling the service", async () => {
    await expect(handleOrderAddException(envelope({ category: "OTHER" }))).rejects.toThrow(/orderId/);
    expect(recordOrderExceptionMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid category before calling the service", async () => {
    await expect(handleOrderAddException(envelope({ orderId: "o1", category: "NOT_REAL" }))).rejects.toThrow(/category/);
    expect(recordOrderExceptionMock).not.toHaveBeenCalled();
  });
});
