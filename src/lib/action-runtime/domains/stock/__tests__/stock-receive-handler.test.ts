import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { receiveStockMock, findAvailableStockBucketMock } = vi.hoisted(() => ({
  receiveStockMock: vi.fn(),
  findAvailableStockBucketMock: vi.fn(),
}));
vi.mock("@/lib/core/stock/stock.service", () => ({
  receiveStock: receiveStockMock,
  findAvailableStockBucket: findAvailableStockBucketMock,
}));

import { handleStockReceive } from "../stock-receive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "stock.receive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleStockReceive", () => {
  beforeEach(() => {
    receiveStockMock.mockReset();
    findAvailableStockBucketMock.mockReset();
  });

  it("receives stock through the canonical service", async () => {
    findAvailableStockBucketMock.mockResolvedValue({ id: "stock-1", quantity: 10 });
    receiveStockMock.mockResolvedValue({ id: "stock-1", productService: { name: "Çelik Profil" }, warehouse: { name: "Merkez Depo" } });

    const result = await handleStockReceive(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", quantity: 5 }));

    expect(receiveStockMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", productServiceId: "prod-1", warehouseId: "wh-1", quantity: 5 }));
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "stock", entityId: "stock-1" } });
  });

  // Regression: stock.receive compensates via a stock.adjustment call (see
  // compensation.ts) built from this snapshot.
  it("builds a compensationSnapshot with the pre-receive quantity", async () => {
    findAvailableStockBucketMock.mockResolvedValue({ id: "stock-1", quantity: 10 });
    receiveStockMock.mockResolvedValue({ id: "stock-1", productService: { name: "Çelik Profil" }, warehouse: { name: "Merkez Depo" } });

    const result = await handleStockReceive(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", quantity: 5 }));

    expect(result.compensationSnapshot).toEqual({ productServiceId: "prod-1", warehouseId: "wh-1", quantityBefore: 10, lot: undefined, batch: undefined, serialNumber: undefined });
  });

  it("treats a bucket that doesn't exist yet as a true zero before-quantity", async () => {
    findAvailableStockBucketMock.mockResolvedValue(null);
    receiveStockMock.mockResolvedValue({ id: "stock-1", productService: { name: "Çelik Profil" }, warehouse: { name: "Merkez Depo" } });

    const result = await handleStockReceive(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", quantity: 5 }));

    expect(result.compensationSnapshot).toMatchObject({ quantityBefore: 0 });
  });

  it("rejects a non-positive quantity before mutation", async () => {
    await expect(handleStockReceive(envelope({ productServiceId: "prod-1", warehouseId: "wh-1", quantity: 0 }))).rejects.toThrow(/quantity/);
    expect(receiveStockMock).not.toHaveBeenCalled();
  });
});
