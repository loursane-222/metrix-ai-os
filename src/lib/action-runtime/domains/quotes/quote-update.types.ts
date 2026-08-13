import type { RuntimeRiskContext } from "../../policy";

/**
 * quote.update'in kabul ettiği tek alan kümesi. items, tam değiştirme
 * (replace-on-commit) semantiğiyle kabul edilir — Customer'ın customFields
 * alanıyla aynı desen: draft, dizinin tamamını client tarafında tutar, her
 * satır komutu (ekle/sil/fiyat değiştir) diziyi yeniden hesaplar, yalnızca
 * commit() bu handler'a ulaşır.
 */
export const QUOTE_UPDATE_ALLOWED_FIELDS = [
  "items",
  "generalDiscountBasisPoints",
  "customerNote",
  "specialTerms",
  "validUntil",
  "paymentTerm",
  "deliveryTerm",
  "deliveryMethod",
] as const;

export type QuoteUpdateAllowedField = (typeof QUOTE_UPDATE_ALLOWED_FIELDS)[number];

export type QuoteUpdateItemLine = {
  productServiceId?: string | null;
  name: string;
  unit?: string | null;
  quantity: number;
  unitPriceCents: number;
  discountBasisPoints?: number;
  vatRateBasisPoints?: number;
};

export type QuoteUpdatePatch = {
  items?: QuoteUpdateItemLine[];
  generalDiscountBasisPoints?: number | null;
  customerNote?: string | null;
  specialTerms?: string | null;
  validUntil?: string | null;
  paymentTerm?: string | null;
  deliveryTerm?: string | null;
  deliveryMethod?: string | null;
};

const ALLOWED_FIELD_SET = new Set<string>(QUOTE_UPDATE_ALLOWED_FIELDS);
const NULLABLE_STRING_FIELDS = ["customerNote", "specialTerms", "paymentTerm", "deliveryTerm", "deliveryMethod"] as const;

function isValidItemLine(value: unknown): value is QuoteUpdateItemLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  if (typeof line.name !== "string" || line.name.trim().length === 0) return false;
  if (typeof line.quantity !== "number") return false;
  if (typeof line.unitPriceCents !== "number") return false;
  if ("productServiceId" in line && line.productServiceId !== null && typeof line.productServiceId !== "string") return false;
  if ("unit" in line && line.unit !== null && typeof line.unit !== "string") return false;
  if ("discountBasisPoints" in line && typeof line.discountBasisPoints !== "number") return false;
  if ("vatRateBasisPoints" in line && typeof line.vatRateBasisPoints !== "number") return false;
  return true;
}

/**
 * Registry'nin generic input schema doğrulaması patch'i yalnızca bir "json"
 * olarak görür — allowlist ve içerik doğrulaması kasıtlı olarak burada,
 * domain seviyesinde yapılır (bkz. CustomerUpdatePatch aynı deseni izler).
 */
export function validateQuoteUpdatePatch(patch: Record<string, unknown>): string[] {
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

  if ("items" in patch) {
    if (!Array.isArray(patch.items) || !patch.items.every(isValidItemLine)) {
      errors.push("patch.items must be an array of valid line items.");
    }
  }

  if ("generalDiscountBasisPoints" in patch && patch.generalDiscountBasisPoints !== null && typeof patch.generalDiscountBasisPoints !== "number") {
    errors.push("patch.generalDiscountBasisPoints must be a number or null.");
  }

  if ("validUntil" in patch && patch.validUntil !== null && typeof patch.validUntil !== "string") {
    errors.push("patch.validUntil must be a string or null.");
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    if (field in patch && patch[field] !== null && typeof patch[field] !== "string") {
      errors.push(`patch.${field} must be a string or null.`);
    }
  }

  return errors;
}

export function buildQuoteUpdateRuntimeRiskContext(patch: Record<string, unknown>): RuntimeRiskContext {
  return {
    changedFields: Object.keys(patch),
    externalSideEffect: false,
    reversibilityClass: "CORRECTABLE",
  };
}
