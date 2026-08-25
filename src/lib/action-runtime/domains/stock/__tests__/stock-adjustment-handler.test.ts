import { beforeEach, describe, expect, it, vi } from "vitest";

const { adjustStockQuantityMock } = vi.hoisted(() => ({ adjustStockQuantityMock: vi.fn() }));
vi.mock("@/lib/core/stock/stock.service", () => ({ adjustStockQuantity: adjustStockQuantityMock }));

import { handleStockAdjustment } from "../stock-adjustment-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "stock.adjustment",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleStockAdjustment", () => {
  beforeEach(() => adjustStockQuantityMock.mockReset());

  it("adjusts stock to the physical count through the canonical service", async () => {
    adjustStockQuantityMock.mockResolvedValue({ id: "stock-1", quantity: 42 });

    const result = await handleStockAdjustment(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", countedQuantity: 42, reason: "Fiziksel sayım" }));

    expect(adjustStockQuantityMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", productServiceId: "prod-1", warehouseId: "wh-1", countedQuantity: 42, reason: "Fiziksel sayım" }));
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "stock", entityId: "stock-1" } });
  });

  it("rejects a negative countedQuantity before mutation", async () => {
    await expect(handleStockAdjustment(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", countedQuantity: -3 }))).rejects.toThrow(/countedQuantity/);
    expect(adjustStockQuantityMock).not.toHaveBeenCalled();
  });
});
