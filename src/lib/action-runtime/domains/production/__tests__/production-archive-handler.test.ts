import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { archiveProductionOrderByIdMock } = vi.hoisted(() => ({ archiveProductionOrderByIdMock: vi.fn() }));
vi.mock("@/lib/core/production/production.service", () => ({ archiveProductionOrderById: archiveProductionOrderByIdMock }));

import { handleProductionArchive } from "../production-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "production.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleProductionArchive", () => {
  beforeEach(() => archiveProductionOrderByIdMock.mockReset());

  it("archives the addressed production order through the canonical service", async () => {
    archiveProductionOrderByIdMock.mockResolvedValue(undefined);

    const result = await handleProductionArchive(envelope({ productionOrderId: "po-1" }));

    expect(archiveProductionOrderByIdMock).toHaveBeenCalledWith("po-1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "production_order", entityId: "po-1" } });
  });

  it("rejects a missing productionOrderId before mutation", async () => {
    await expect(handleProductionArchive(envelope({}))).rejects.toThrow(/productionOrderId/);
    expect(archiveProductionOrderByIdMock).not.toHaveBeenCalled();
  });
});
