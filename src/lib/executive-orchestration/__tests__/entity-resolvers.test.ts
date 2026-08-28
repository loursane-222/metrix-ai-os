import { describe, expect, it, vi } from "vitest";

const {
  listProductionOrdersMock,
  listWorkCentersMock,
  listMachinesMock,
  listWarehousesForOrganizationMock,
  listOpenExecutiveActionsMock,
  listActiveCollectionActionsMock,
  listPaymentsMock,
  listTasksMock,
  listActiveCompanyUnitsMock,
  listDomainCustomFieldsMock,
} = vi.hoisted(() => ({
  listProductionOrdersMock: vi.fn(),
  listWorkCentersMock: vi.fn(),
  listMachinesMock: vi.fn(),
  listWarehousesForOrganizationMock: vi.fn(),
  listOpenExecutiveActionsMock: vi.fn(),
  listActiveCollectionActionsMock: vi.fn(),
  listPaymentsMock: vi.fn(),
  listTasksMock: vi.fn(),
  listActiveCompanyUnitsMock: vi.fn(),
  listDomainCustomFieldsMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/core/production/production.service", () => ({
  listProductionOrders: listProductionOrdersMock,
  listWorkCenters: listWorkCentersMock,
  listMachines: listMachinesMock,
}));
vi.mock("@/lib/core/stock/stock.service", () => ({ listWarehousesForOrganization: listWarehousesForOrganizationMock }));
vi.mock("@/lib/core/executive-actions/executive-action-engine.service", () => ({ listOpenExecutiveActions: listOpenExecutiveActionsMock }));
vi.mock("@/lib/core/collection-actions/collection-action.service", () => ({ listActiveCollectionActions: listActiveCollectionActionsMock }));
vi.mock("@/lib/core/payments/payment.service", () => ({ listPayments: listPaymentsMock }));
vi.mock("@/lib/core/tasks/task.service", () => ({ listTasks: listTasksMock }));
vi.mock("@/lib/company/company.service", () => ({ listActiveCompanyUnits: listActiveCompanyUnitsMock }));
vi.mock("@/lib/field-authority/custom-field.service", () => ({ listDomainCustomFields: listDomainCustomFieldsMock }));

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

describe("resolveEntityReference — compensator id-field domains", () => {
  it("resolves a machine by name", async () => {
    listMachinesMock.mockResolvedValue([{ id: "m-1", name: "Pres 1" }]);

    const result = await resolveEntityReference("machine", "org-1", "Pres 1");

    expect(result).toEqual({ status: "RESOLVED", id: "m-1", label: "Pres 1" });
  });

  it("resolves an open executive action by title", async () => {
    listOpenExecutiveActionsMock.mockResolvedValue([{ id: "ea-1", title: "Müşteriyi ara" }]);

    const result = await resolveEntityReference("executiveAction", "org-1", "müşteriyi ara");

    expect(result).toEqual({ status: "RESOLVED", id: "ea-1", label: "Müşteriyi ara" });
    expect(listOpenExecutiveActionsMock).toHaveBeenCalledWith("org-1");
  });

  it("resolves an active collection action by title", async () => {
    listActiveCollectionActionsMock.mockResolvedValue([{ id: "ca-1", title: "Ödeme takibi" }]);

    const result = await resolveEntityReference("collectionAction", "org-1", "Ödeme takibi");

    expect(result).toEqual({ status: "RESOLVED", id: "ca-1", label: "Ödeme takibi" });
  });

  it("resolves a payment by title", async () => {
    listPaymentsMock.mockResolvedValue([{ id: "pay-1", title: "Ağustos tahsilatı" }]);

    const result = await resolveEntityReference("payment", "org-1", "Ağustos tahsilatı");

    expect(result).toEqual({ status: "RESOLVED", id: "pay-1", label: "Ağustos tahsilatı" });
  });

  it("resolves a task by title", async () => {
    listTasksMock.mockResolvedValue([{ id: "t-1", title: "Raporu bitir" }]);

    const result = await resolveEntityReference("task", "org-1", "raporu bitir");

    expect(result).toEqual({ status: "RESOLVED", id: "t-1", label: "Raporu bitir" });
  });

  it("resolves a company unit by name", async () => {
    listActiveCompanyUnitsMock.mockResolvedValue([{ id: "cu-1", name: "İstanbul Şubesi" }]);

    const result = await resolveEntityReference("companyUnit", "org-1", "istanbul subesi");

    expect(result).toEqual({ status: "RESOLVED", id: "cu-1", label: "İstanbul Şubesi" });
  });

  it("resolves a custom field definition by label, scoped to the company module", async () => {
    listDomainCustomFieldsMock.mockResolvedValue([{ id: "cf-1", label: "Kuruluş Yılı" }]);

    const result = await resolveEntityReference("customFieldDefinition", "org-1", "Kuruluş Yılı");

    expect(result).toEqual({ status: "RESOLVED", id: "cf-1", label: "Kuruluş Yılı" });
    expect(listDomainCustomFieldsMock).toHaveBeenCalledWith("org-1", "company", "company");
  });
});
