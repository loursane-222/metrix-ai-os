import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));
import { requestCustomFieldDefinitionChange, validateCustomFieldDefinition } from "../custom-field.service";

describe("domain-aware Company custom field authority", () => {
  const field = { organizationId: "org-1", actorId: "u-1", module: "company" as const, entityType: "company", key: "aylik_enerji_tuketimi", label: "Aylık enerji tüketimi", description: "Doğrulanmış aylık tüketim", valueType: "integer" as const, unit: "kWh", uiSection: "Sürdürülebilirlik", sensitivity: "INTERNAL", riskLevel: "MEDIUM", approvalPolicy: "EXPLICIT" };
  it("accepts Company definitions in the existing common registry", () => expect(validateCustomFieldDefinition(field)).toEqual([]));
  it("requires approval before schema creation", () => expect(requestCustomFieldDefinitionChange(field)).toMatchObject({ status: "APPROVAL_REQUIRED", approvalPolicy: "EXPLICIT" }));
});
