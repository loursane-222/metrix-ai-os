import { beforeEach, describe, expect, it, vi } from "vitest";

const { setCompanyUnitActiveMock, deprecateCustomerCustomFieldMock, companyUnitFindFirstMock, customFieldDefinitionFindFirstMock } = vi.hoisted(() => ({
  setCompanyUnitActiveMock: vi.fn(),
  deprecateCustomerCustomFieldMock: vi.fn(),
  companyUnitFindFirstMock: vi.fn(),
  customFieldDefinitionFindFirstMock: vi.fn(),
}));
vi.mock("@/lib/company/company.service", () => ({
  updateCompanyProfile: vi.fn(),
  createCompanyUnit: vi.fn(),
  updateCompanyUnit: vi.fn(),
  setCompanyUnitActive: setCompanyUnitActiveMock,
}));
vi.mock("@/lib/field-authority/custom-field.service", () => ({
  createApprovedCustomFieldDefinition: vi.fn(),
  deprecateCustomerCustomField: deprecateCustomerCustomFieldMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    companyUnit: { findFirst: companyUnitFindFirstMock },
    customFieldDefinition: { findFirst: customFieldDefinitionFindFirstMock },
  },
}));

import { createInMemoryHandlerRegistry } from "../../../execution";
import { registerCompanyActions } from "../index";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "test",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["company.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("company.unit.archive / company.field_definition.deprecate", () => {
  beforeEach(() => {
    setCompanyUnitActiveMock.mockReset();
    deprecateCustomerCustomFieldMock.mockReset();
    companyUnitFindFirstMock.mockReset();
    customFieldDefinitionFindFirstMock.mockReset();
  });

  it("archives the addressed company unit through setCompanyUnitActive", async () => {
    const registry = createInMemoryHandlerRegistry();
    registerCompanyActions(registry);
    companyUnitFindFirstMock.mockResolvedValue({ id: "cu1", active: true });
    setCompanyUnitActiveMock.mockResolvedValue(undefined);

    const result = await registry.getHandler("company.unit.archive")(envelope({ companyUnitId: "cu1" }));

    expect(setCompanyUnitActiveMock).toHaveBeenCalledWith("org-1", "cu1", false);
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "CompanyUnit", entityId: "cu1" } });
  });

  it("reports NO_CHANGE for company.unit.archive when already inactive", async () => {
    const registry = createInMemoryHandlerRegistry();
    registerCompanyActions(registry);
    companyUnitFindFirstMock.mockResolvedValue({ id: "cu1", active: false });

    const result = await registry.getHandler("company.unit.archive")(envelope({ companyUnitId: "cu1" }));

    expect(setCompanyUnitActiveMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ resultOutcome: "NO_CHANGE" });
  });

  it("deprecates the addressed field definition through deprecateCustomerCustomField", async () => {
    const registry = createInMemoryHandlerRegistry();
    registerCompanyActions(registry);
    customFieldDefinitionFindFirstMock.mockResolvedValue({ id: "def1", active: true });
    deprecateCustomerCustomFieldMock.mockResolvedValue({ id: "def1" });

    const result = await registry.getHandler("company.field_definition.deprecate")(envelope({ definitionId: "def1" }));

    expect(deprecateCustomerCustomFieldMock).toHaveBeenCalledWith({ organizationId: "org-1", definitionId: "def1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "CustomFieldDefinition", entityId: "def1" } });
  });

  it("reports NO_CHANGE for field_definition.deprecate when already inactive", async () => {
    const registry = createInMemoryHandlerRegistry();
    registerCompanyActions(registry);
    customFieldDefinitionFindFirstMock.mockResolvedValue({ id: "def1", active: false });

    const result = await registry.getHandler("company.field_definition.deprecate")(envelope({ definitionId: "def1" }));

    expect(deprecateCustomerCustomFieldMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ resultOutcome: "NO_CHANGE" });
  });
});
