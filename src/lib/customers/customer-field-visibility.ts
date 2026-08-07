import type { OrganizationRole } from "@prisma/client";

import { canRoleViewSensitivity, filterRecordFieldsBySensitivity, isFieldSensitivity } from "@/lib/field-authority/field-visibility";
import { CUSTOMER_RESPONSE_FIELD_SENSITIVITY } from "./customer-field-registry";

export type CustomerCustomFieldValueProjection = {
  definitionId: string;
  label?: string;
  value: unknown;
  definition?: { sensitivity?: unknown };
};

export function filterCustomerRecordForRole<T extends Record<string, unknown>>(record: T, role: OrganizationRole | string): Partial<T> {
  return filterRecordFieldsBySensitivity(record, role, CUSTOMER_RESPONSE_FIELD_SENSITIVITY);
}

export function filterCustomerCustomFieldValuesForRole<T extends CustomerCustomFieldValueProjection>(values: readonly T[], role: OrganizationRole | string): T[] {
  return values.filter((item) => {
    const raw = item.definition?.sensitivity;
    const sensitivity = isFieldSensitivity(raw) ? raw : "INTERNAL";
    return canRoleViewSensitivity(role, sensitivity);
  });
}
