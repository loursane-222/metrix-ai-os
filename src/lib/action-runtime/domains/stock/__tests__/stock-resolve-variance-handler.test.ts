import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveInventoryVarianceMock } = vi.hoisted(() => ({ resolveInventoryVarianceMock: vi.fn() }));
vi.mock("@/lib/core/stock/stock-intelligence.service", () => ({ resolveInventoryVariance: resolveInventoryVarianceMock }));

import { handleStockResolveVariance } from "../stock-resolve-variance-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "stock.resolveVariance",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["stock.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleStockResolveVariance", () => {
  beforeEach(() => resolveInventoryVarianceMock.mockReset());

  it("confirms the variance through the exact same canonical service POST /api/stock/counts/[countRecordId]/resolve already called", async () => {
    resolveInventoryVarianceMock.mockResolvedValue({ id: "count-1", status: "CONFIRMED" });
    const result = await handleStockResolveVariance(envelope({ countRecordId: "count-1", resolution: "CONFIRM" }));
    expect(resolveInventoryVarianceMock).toHaveBeenCalledWith("count-1", "org-1", "CONFIRM", undefined, "user-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "stock_count", entityId: "count-1" } });
  });

  it("dismisses the variance with an optional note", async () => {
    resolveInventoryVarianceMock.mockResolvedValue({ id: "count-1", status: "DISMISSED" });
    await handleStockResolveVariance(envelope({ countRecordId: "count-1", resolution: "DISMISS", note: "sayım hatası" }));
    expect(resolveInventoryVarianceMock).toHaveBeenCalledWith("count-1", "org-1", "DISMISS", "sayım hatası", "user-1");
  });

  it("rejects an invalid resolution before calling the service", async () => {
    await expect(handleStockResolveVariance(envelope({ countRecordId: "count-1", resolution: "APPROVE" }))).rejects.toThrow(/resolution/);
    expect(resolveInventoryVarianceMock).not.toHaveBeenCalled();
  });
});
