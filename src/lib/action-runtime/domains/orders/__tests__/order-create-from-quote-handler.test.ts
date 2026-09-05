import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { createOrderFromQuoteMock } = vi.hoisted(() => ({ createOrderFromQuoteMock: vi.fn() }));
vi.mock("@/lib/core/orders/order.service", () => ({ createOrderFromQuote: createOrderFromQuoteMock }));

import { handleOrderCreateFromQuote } from "../order-create-from-quote-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "order.createFromQuote",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["orders.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleOrderCreateFromQuote", () => {
  beforeEach(() => createOrderFromQuoteMock.mockReset());

  it("creates the order through the exact same canonical service POST /api/orders/from-quote already called, auto-deriving customer/items from the quote", async () => {
    createOrderFromQuoteMock.mockResolvedValue({ id: "o1", orderNumber: "SIP-0099" });
    const result = await handleOrderCreateFromQuote(envelope({ quoteId: "quote-1" }));
    expect(createOrderFromQuoteMock).toHaveBeenCalledWith({ organizationId: "org-1", quoteId: "quote-1", performedById: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "o1" } });
  });

  it("rejects a missing quoteId before calling the service", async () => {
    await expect(handleOrderCreateFromQuote(envelope({}))).rejects.toThrow(/quoteId/);
    expect(createOrderFromQuoteMock).not.toHaveBeenCalled();
  });
});
