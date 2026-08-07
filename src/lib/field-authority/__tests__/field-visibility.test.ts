import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { canRoleViewSensitivity, filterRecordFieldsBySensitivity } from "../field-visibility";
import { filterCustomerCustomFieldValuesForRole } from "@/lib/customers/customer-field-visibility";

describe("role-based field visibility authority", () => {
  it("uses the canonical PUBLIC / INTERNAL / SENSITIVE role thresholds", () => {
    expect(canRoleViewSensitivity(OrganizationRole.EMPLOYEE, "PUBLIC")).toBe(true);
    expect(canRoleViewSensitivity(OrganizationRole.EMPLOYEE, "INTERNAL")).toBe(false);
    expect(canRoleViewSensitivity(OrganizationRole.TEAM_LEAD, "INTERNAL")).toBe(true);
    expect(canRoleViewSensitivity(OrganizationRole.TEAM_LEAD, "SENSITIVE")).toBe(false);
    expect(canRoleViewSensitivity(OrganizationRole.MANAGER, "SENSITIVE")).toBe(true);
    expect(canRoleViewSensitivity(OrganizationRole.EXECUTIVE, "SENSITIVE")).toBe(true);
    expect(canRoleViewSensitivity(OrganizationRole.OWNER, "SENSITIVE")).toBe(true);
  });

  it("removes classified fields rather than returning null placeholders", () => {
    const source = { displayName: "Atlas", taxNumber: "123", metrixNote: "private" };
    const projected = filterRecordFieldsBySensitivity(source, OrganizationRole.EMPLOYEE, {
      displayName: "PUBLIC",
      taxNumber: "INTERNAL",
      metrixNote: "SENSITIVE",
    });
    expect(projected).toEqual({ displayName: "Atlas" });
    expect(projected).not.toHaveProperty("taxNumber");
    expect(projected).not.toHaveProperty("metrixNote");
  });

  it("hides a SENSITIVE custom field from TEAM_LEAD and exposes it to MANAGER+", () => {
    const values = [{ definitionId: "sensitive-1", label: "Yönetim notu", value: "Gizli", definition: { sensitivity: "SENSITIVE" } }];
    expect(filterCustomerCustomFieldValuesForRole(values, OrganizationRole.TEAM_LEAD)).toEqual([]);
    expect(filterCustomerCustomFieldValuesForRole(values, OrganizationRole.MANAGER)).toEqual(values);
    expect(filterCustomerCustomFieldValuesForRole(values, OrganizationRole.OWNER)).toEqual(values);
  });
});
