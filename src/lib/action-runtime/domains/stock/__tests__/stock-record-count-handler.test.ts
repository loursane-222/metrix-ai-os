import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordPhysicalCountMock } = vi.hoisted(() => ({ recordPhysicalCountMock: vi.fn() }));
vi.mock("@/lib/core/stock/stock-intelligence.service", () => ({ recordPhysicalCount: recordPhysicalCountMock }));

import { handleStockRecordCount } from "../stock-record-count-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "stock.recordCount",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleStockRecordCount", () => {
  beforeEach(() => recordPhysicalCountMock.mockReset());

  it("records the count through the exact same canonical service POST /api/stock/counts already called", async () => {
    recordPhysicalCountMock.mockResolvedValue({ id: "count-1", varianceQuantity: "-2" });
    const result = await handleStockRecordCount(envelope({ stockId: "stock-1", countedQuantity: 8, note: "sayım" }));
    expect(recordPhysicalCountMock).toHaveBeenCalledWith("stock-1", "org-1", 8, "sayım", "user-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "stock_count", entityId: "count-1" }, metadata: { varianceQuantity: "-2" } });
  });

  it("rejects a missing stockId before calling the service", async () => {
    await expect(handleStockRecordCount(envelope({ countedQuantity: 8 }))).rejects.toThrow(/stockId/);
    expect(recordPhysicalCountMock).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric countedQuantity before calling the service", async () => {
    await expect(handleStockRecordCount(envelope({ stockId: "stock-1", countedQuantity: "not-a-number" }))).rejects.toThrow(/countedQuantity/);
    expect(recordPhysicalCountMock).not.toHaveBeenCalled();
  });
});
