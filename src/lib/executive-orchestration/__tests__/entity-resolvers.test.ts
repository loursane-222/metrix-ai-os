import { describe, expect, it, vi } from "vitest";

const { listProductionOrdersMock, listWorkCentersMock, listWarehousesForOrganizationMock } = vi.hoisted(() => ({
  listProductionOrdersMock: vi.fn(),
  listWorkCentersMock: vi.fn(),
  listWarehousesForOrganizationMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/core/production/production.service", () => ({
  listProductionOrders: listProductionOrdersMock,
  listWorkCenters: listWorkCentersMock,
}));
vi.mock("@/lib/core/stock/stock.service", () => ({ listWarehousesForOrganization: listWarehousesForOrganizationMock }));

const { resolveEntityReference } = await import("../entity-resolvers");

describe("resolveEntityReference — Faz 2 domains", () => {
  it("resolves a production order by its orderNumber", async () => {
    listProductionOrdersMock.mockResolvedValue([{ id: "po-1", orderNumber: "PO-2026-001" }]);

    const result = await resolveEntityReference("production", "org-1", "PO-2026-001");

    expect(result).toEqual({ status: "RESOLVED", id: "po-1", label: "PO-2026-001" });
  });

  it("resolves a warehouse by name, case/diacritic-insensitively", async () => {
    listWarehousesForOrganizationMock.mockResolvedValue([{ id: "wh-1", name: "Merkez Depo" }]);

    const result = await resolveEntityReference("warehouse", "org-1", "merkez depo");

    expect(result).toEqual({ status: "RESOLVED", id: "wh-1", label: "Merkez Depo" });
  });

  it("reports AMBIGUOUS when two work centers share a partial name match", async () => {
    listWorkCentersMock.mockResolvedValue([{ id: "wc-1", name: "Kesim Hattı 1" }, { id: "wc-2", name: "Kesim Hattı 2" }]);

    const result = await resolveEntityReference("workCenter", "org-1", "kesim");

    expect(result.status).toBe("AMBIGUOUS");
  });

  it("reports NOT_FOUND when no work center matches", async () => {
    listWorkCentersMock.mockResolvedValue([{ id: "wc-1", name: "Kesim Hattı" }]);

    const result = await resolveEntityReference("workCenter", "org-1", "Paketleme");

    expect(result).toEqual({ status: "NOT_FOUND" });
  });
});
