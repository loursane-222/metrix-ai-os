import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findStockBucketMock, getStockByIdMock, recordPhysicalCountMock, resolveInventoryVarianceMock,
} = vi.hoisted(() => ({
  findStockBucketMock: vi.fn(),
  getStockByIdMock: vi.fn(),
  recordPhysicalCountMock: vi.fn(),
  resolveInventoryVarianceMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

vi.mock("../stock.repository", () => ({
  createStockRow: vi.fn(),
  createWarehouse: vi.fn(),
  findAvailableStockRows: vi.fn(),
  findStockBucket: findStockBucketMock,
  getStockById: getStockByIdMock,
  listStockForOrganization: vi.fn(),
  listWarehouses: vi.fn(),
  recordMovement: vi.fn(),
  updateStockQuantity: vi.fn(),
}));

vi.mock("../stock-intelligence.service", () => ({
  recordPhysicalCount: recordPhysicalCountMock,
  resolveInventoryVariance: resolveInventoryVarianceMock,
}));

import { adjustStockQuantity } from "../stock.service";

const validInput = { organizationId: "org-1", productServiceId: "prod-1", warehouseId: "wh-1", countedQuantity: 42, reason: "Fiziksel sayım" };

describe("adjustStockQuantity", () => {
  beforeEach(() => {
    findStockBucketMock.mockReset();
    getStockByIdMock.mockReset();
    recordPhysicalCountMock.mockReset();
    resolveInventoryVarianceMock.mockReset();
  });

  it("rejects a negative countedQuantity without touching any stock data", async () => {
    await expect(adjustStockQuantity({ ...validInput, countedQuantity: -1 })).rejects.toThrow();
    expect(findStockBucketMock).not.toHaveBeenCalled();
  });

  it("throws when no AVAILABLE stock bucket exists for the product/warehouse", async () => {
    findStockBucketMock.mockResolvedValue(null);

    await expect(adjustStockQuantity(validInput)).rejects.toThrow(/No AVAILABLE stock/);
    expect(recordPhysicalCountMock).not.toHaveBeenCalled();
  });

  it("resolves the variance and updates the stock record when the count differs from the system quantity", async () => {
    findStockBucketMock.mockResolvedValue({ id: "stock-1", quantity: 30 });
    recordPhysicalCountMock.mockResolvedValue({ id: "count-1", status: "PENDING_INVESTIGATION" });
    resolveInventoryVarianceMock.mockResolvedValue({ id: "count-1", status: "CORRECTED" });
    getStockByIdMock.mockResolvedValue({ id: "stock-1", quantity: 42 });

    const result = await adjustStockQuantity(validInput);

    expect(recordPhysicalCountMock).toHaveBeenCalledWith("stock-1", "org-1", 42, "Fiziksel sayım", undefined, {});
    expect(resolveInventoryVarianceMock).toHaveBeenCalledWith("count-1", "org-1", "CONFIRM", "Fiziksel sayım", undefined, {});
    expect(result).toEqual({ id: "stock-1", quantity: 42 });
  });

  it("skips resolveInventoryVariance when the physical count matches the system quantity (no variance)", async () => {
    findStockBucketMock.mockResolvedValue({ id: "stock-1", quantity: 42 });
    recordPhysicalCountMock.mockResolvedValue({ id: "count-2", status: "NO_VARIANCE" });
    getStockByIdMock.mockResolvedValue({ id: "stock-1", quantity: 42 });

    await adjustStockQuantity(validInput);

    expect(resolveInventoryVarianceMock).not.toHaveBeenCalled();
  });
});
