import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateStockQuantityMock, recordMovementMock } = vi.hoisted(() => ({
  updateStockQuantityMock: vi.fn(),
  recordMovementMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

vi.mock("../stock.repository", async () => {
  const actual = await vi.importActual<typeof import("../stock.repository")>("../stock.repository");
  return { ...actual, updateStockQuantity: updateStockQuantityMock, recordMovement: recordMovementMock };
});

import { releaseStockForOrder } from "../stock.service";

function fakeTx(order: { reservedInventory: unknown } | null, stocks: Record<string, { id: string; reservedQuantity: number }>) {
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn(),
    },
    stock: {
      findFirst: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(stocks[where.id] ?? null)),
    },
  } as never;
}

describe("releaseStockForOrder", () => {
  beforeEach(() => {
    updateStockQuantityMock.mockReset();
    recordMovementMock.mockReset();
  });

  it("does nothing when the order has no reservedInventory snapshot", async () => {
    const tx = fakeTx({ reservedInventory: null }, {});
    await releaseStockForOrder("order-1", "org-1", tx);
    expect(updateStockQuantityMock).not.toHaveBeenCalled();
  });

  it("releases the full reserved amount when none of it has been consumed yet", async () => {
    const tx = fakeTx(
      { reservedInventory: [{ productServiceId: "prod-1", orderItemId: "item-1", stockId: "stock-1", reserved: 10 }] },
      { "stock-1": { id: "stock-1", reservedQuantity: 10 } },
    );

    await releaseStockForOrder("order-1", "org-1", tx);

    expect(updateStockQuantityMock).toHaveBeenCalledWith("stock-1", "org-1", { reservedQuantity: -10 }, tx);
    expect(recordMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", stockId: "stock-1", movementType: "RELEASE_RESERVATION", quantity: 10, sourceType: "ORDER", sourceId: "order-1" }),
      tx,
    );
  });

  it("clamps release to only the still-outstanding portion when a delivery already consumed part of the reservation", async () => {
    // Original reservation was 10; consumeStockForDelivery already decremented
    // reservedQuantity by 4 for an earlier delivery without touching this
    // (stale) reservedInventory snapshot — only the remaining 6 must release.
    const tx = fakeTx(
      { reservedInventory: [{ productServiceId: "prod-1", orderItemId: "item-1", stockId: "stock-1", reserved: 10 }] },
      { "stock-1": { id: "stock-1", reservedQuantity: 6 } },
    );

    await releaseStockForOrder("order-1", "org-1", tx);

    expect(updateStockQuantityMock).toHaveBeenCalledWith("stock-1", "org-1", { reservedQuantity: -6 }, tx);
  });

  it("is idempotent: a repeated call after a full release is a no-op", async () => {
    const tx = fakeTx(
      { reservedInventory: [{ productServiceId: "prod-1", orderItemId: "item-1", stockId: "stock-1", reserved: 10 }] },
      { "stock-1": { id: "stock-1", reservedQuantity: 0 } },
    );

    await releaseStockForOrder("order-1", "org-1", tx);

    expect(updateStockQuantityMock).not.toHaveBeenCalled();
    expect(recordMovementMock).not.toHaveBeenCalled();
  });

  it("never touches actual quantity — only reservedQuantity", async () => {
    const tx = fakeTx(
      { reservedInventory: [{ productServiceId: "prod-1", orderItemId: "item-1", stockId: "stock-1", reserved: 5 }] },
      { "stock-1": { id: "stock-1", reservedQuantity: 5 } },
    );

    await releaseStockForOrder("order-1", "org-1", tx);

    for (const call of updateStockQuantityMock.mock.calls) {
      expect(call[2]).not.toHaveProperty("quantity");
    }
  });
});
