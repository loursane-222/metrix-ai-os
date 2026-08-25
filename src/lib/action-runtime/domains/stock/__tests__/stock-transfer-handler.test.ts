import { beforeEach, describe, expect, it, vi } from "vitest";

const { transferStockMock } = vi.hoisted(() => ({ transferStockMock: vi.fn() }));
vi.mock("@/lib/core/stock/stock.service", () => ({ transferStock: transferStockMock }));

import { handleStockTransfer } from "../stock-transfer-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "stock.transfer",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleStockTransfer", () => {
  beforeEach(() => transferStockMock.mockReset());

  it("transfers stock between warehouses through the canonical service", async () => {
    transferStockMock.mockResolvedValue({ source: { id: "stock-1" }, destination: { id: "stock-2" } });

    const result = await handleStockTransfer(envelope({ productServiceId: "prod-1", fromWarehouseId: "wh-1", toWarehouseId: "wh-2", quantity: 5 }));

    expect(transferStockMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", productServiceId: "prod-1", fromWarehouseId: "wh-1", toWarehouseId: "wh-2", quantity: 5 }));
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "stock", entityId: "stock-2" } });
  });

  it("rejects a non-positive quantity before mutation", async () => {
    await expect(handleStockTransfer(envelope({ productServiceId: "prod-1", fromWarehouseId: "wh-1", toWarehouseId: "wh-2", quantity: 0 }))).rejects.toThrow(/quantity/);
    expect(transferStockMock).not.toHaveBeenCalled();
  });
});
