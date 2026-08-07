import { OrganizationRole } from "@prisma/client";

import type { FieldSensitivity } from "./field-authority";

const ROLE_SENSITIVITY_ACCESS: Readonly<Record<OrganizationRole, readonly FieldSensitivity[]>> = {
  [OrganizationRole.OWNER]: ["PUBLIC", "INTERNAL", "SENSITIVE"],
  [OrganizationRole.EXECUTIVE]: ["PUBLIC", "INTERNAL", "SENSITIVE"],
  [OrganizationRole.MANAGER]: ["PUBLIC", "INTERNAL", "SENSITIVE"],
  [OrganizationRole.TEAM_LEAD]: ["PUBLIC", "INTERNAL"],
  [OrganizationRole.EMPLOYEE]: ["PUBLIC"],
};

export function isFieldSensitivity(value: unknown): value is FieldSensitivity {
  return value === "PUBLIC" || value === "INTERNAL" || value === "SENSITIVE";
}

export function canRoleViewSensitivity(role: OrganizationRole | string, sensitivity: FieldSensitivity): boolean {
  return ROLE_SENSITIVITY_ACCESS[role as OrganizationRole]?.includes(sensitivity) ?? false;
}

/**
 * Domain-independent response projection. Unknown fields are preserved so a
 * domain must deliberately classify only the fields it owns; classified fields
 * are removed entirely when the caller's canonical organization role cannot
 * view them.
 */
export function filterRecordFieldsBySensitivity<T extends Record<string, unknown>>(
  record: T,
  role: OrganizationRole | string,
  fields: Readonly<Record<string, FieldSensitivity>>,
): Partial<T> {
  const projected: Record<string, unknown> = { ...record };
  for (const [field, sensitivity] of Object.entries(fields)) {
    if (!canRoleViewSensitivity(role, sensitivity)) delete projected[field];
  }
  return projected as Partial<T>;
}
