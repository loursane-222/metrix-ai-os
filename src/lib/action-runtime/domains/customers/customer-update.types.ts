import type { RuntimeRiskContext } from "../../policy";

/**
 * customer.update'in kabul ettiği tek alan kümesi. id/organizationId/
 * createdAt/updatedAt, sistem alanları (source/createdByUserId/
 * updatedByUserId), tenant alanları ve ilişki koleksiyonları (contacts/
 * quotes/payments/collectionActions) kasıtlı olarak dışarıda bırakılır.
 * balanceCents/currency de dışarıda bırakılır — mevcut PATCH route'ta da
 * genel güncellemeye açık değiller, Payment/Quote akışlarının sorumluluğu.
 */
export const CUSTOMER_UPDATE_ALLOWED_FIELDS = [
  "displayName",
  "legalName",
  "phone",
  "email",
  "tier",
  "healthScore",
  "metrixNote",
  "status",
  "cariKodu",
  "taxNumber",
  "taxOffice",
  "mersisNo",
  "tradeRegistryNo",
  "billingAddress",
  "shippingAddress",
  "eInvoiceEnabled",
  "eArchiveEnabled",
] as const;

export type CustomerUpdateAllowedField = (typeof CUSTOMER_UPDATE_ALLOWED_FIELDS)[number];

export type CustomerUpdatePatch = {
  displayName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  tier?: string;
  healthScore?: number;
  metrixNote?: string;
  status?: "ACTIVE" | "PASSIVE" | "BLOCKED";
  cariKodu?: string;
  taxNumber?: string;
  taxOffice?: string;
  mersisNo?: string;
  tradeRegistryNo?: string;
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  eInvoiceEnabled?: boolean;
  eArchiveEnabled?: boolean;
};

const ALLOWED_FIELD_SET = new Set<string>(CUSTOMER_UPDATE_ALLOWED_FIELDS);
const STRING_FIELDS = ["displayName", "legalName", "phone", "email", "tier", "metrixNote", "cariKodu", "taxNumber", "taxOffice", "mersisNo", "tradeRegistryNo"] as const;
const JSON_OBJECT_FIELDS = ["billingAddress", "shippingAddress"] as const;
const STATUS_VALUES = ["ACTIVE", "PASSIVE", "BLOCKED"];

/**
 * patch'in yalnızca izin verilen alanları taşıdığını, boş olmadığını ve
 * her alanın doğru tipte olduğunu doğrular. Registry'nin generic input
 * schema doğrulaması patch'i yalnızca bir "json" olarak görür — allowlist
 * ve içerik doğrulaması kasıtlı olarak burada, domain seviyesinde yapılır.
 */
export function validateCustomerUpdatePatch(patch: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const keys = Object.keys(patch);

  if (keys.length === 0) {
    errors.push("patch must not be empty.");
    return errors;
  }

  for (const key of keys) {
    if (!ALLOWED_FIELD_SET.has(key)) {
      errors.push(`patch.${key} is not an allowed field.`);
    }
  }

  for (const field of STRING_FIELDS) {
    if (field in patch && typeof patch[field] !== "string") {
      errors.push(`patch.${field} must be a string.`);
    }
  }

  if ("healthScore" in patch && typeof patch.healthScore !== "number") {
    errors.push("patch.healthScore must be a number.");
  }

  if ("eInvoiceEnabled" in patch && typeof patch.eInvoiceEnabled !== "boolean") {
    errors.push("patch.eInvoiceEnabled must be a boolean.");
  }

  if ("eArchiveEnabled" in patch && typeof patch.eArchiveEnabled !== "boolean") {
    errors.push("patch.eArchiveEnabled must be a boolean.");
  }

  if ("status" in patch && !STATUS_VALUES.includes(patch.status as string)) {
    errors.push(`patch.status must be one of: ${STATUS_VALUES.join(", ")}.`);
  }

  for (const field of JSON_OBJECT_FIELDS) {
    if (field in patch) {
      const value = patch[field];
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`patch.${field} must be an object.`);
      }
    }
  }

  return errors;
}

/**
 * Generic çalışma zamanı risk sözleşmesi. Customers'a özgü alan/tutar
 * kuralı içermez — yalnızca "hangi alanlar değişti" bilgisini taşır.
 */
export function buildCustomerUpdateRuntimeRiskContext(patch: Record<string, unknown>): RuntimeRiskContext {
  return {
    changedFields: Object.keys(patch),
    externalSideEffect: false,
    reversibilityClass: "CORRECTABLE",
  };
}
