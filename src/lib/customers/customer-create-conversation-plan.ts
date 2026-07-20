import { isRecord } from "@/lib/api/validation";

export const CUSTOMER_CREATE_PLAN_FIELDS = ["displayName", "legalName", "tier", "phone", "email", "primaryContact.fullName", "primaryContact.title", "primaryContact.phone", "primaryContact.email", "cariKodu", "taxNumber", "taxOffice", "mersisNo", "tradeRegistryNo", "billingAddress.line1", "billingAddress.line2", "billingAddress.district", "billingAddress.city", "billingAddress.postalCode", "billingAddress.country", "shippingAddress.line1", "shippingAddress.line2", "shippingAddress.district", "shippingAddress.city", "shippingAddress.postalCode", "shippingAddress.country", "currency", "commercialTerms.paymentTermDays", "commercialTerms.creditLimitCents", "commercialTerms.discountRateBasisPoints", "commercialTerms.deliveryTerm", "commercialTerms.notes", "eInvoiceEnabled", "eArchiveEnabled", "healthScore", "metrixNote"] as const;
export type CustomerCreatePlanField = (typeof CUSTOMER_CREATE_PLAN_FIELDS)[number];
export type CustomerCreatePlanFields = Partial<Record<CustomerCreatePlanField, string | number | boolean>>;
export const CUSTOMER_CREATE_UNSUPPORTED_FIELDS = ["primaryContact"] as const;
export type CustomerCreateUnsupportedField = (typeof CUSTOMER_CREATE_UNSUPPORTED_FIELDS)[number];
export type CustomerCreateUnsupportedNotice = { field: CustomerCreateUnsupportedField; userLabel: string; message: string };
export type CustomerCreatePlan =
  | { kind: "CREATE_PLAN"; intent: "OPEN" | "UPDATE_DRAFT" | "COMMIT" | "OPEN_UPDATE_COMMIT"; fields: CustomerCreatePlanFields; explicitCommit: boolean; unsupportedFields: CustomerCreateUnsupportedNotice[]; operation?: "CREATE" | "UPDATE" | "ENRICH"; entityReference?: string }
  | { kind: "STATUS_QUERY" }
  | { kind: "MISSING_FIELDS_QUERY" }
  | { kind: "CANCEL" }
  | { kind: "NOT_CUSTOMER_CREATE" }
  | { kind: "CLARIFICATION_REQUIRED"; reason: string };

export function validateCustomerCreatePlan(raw: unknown): CustomerCreatePlan | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") return null;
  if (["STATUS_QUERY", "MISSING_FIELDS_QUERY", "CANCEL", "NOT_CUSTOMER_CREATE"].includes(raw.kind)) return hasExactKeys(raw, ["kind"]) ? { kind: raw.kind } as CustomerCreatePlan : null;
  if (raw.kind === "CLARIFICATION_REQUIRED") return hasExactKeys(raw, ["kind", "reason"]) && typeof raw.reason === "string" && raw.reason.trim() ? { kind: raw.kind, reason: raw.reason.trim() } : null;
  if (raw.kind !== "CREATE_PLAN" || !isRecord(raw.fields) || typeof raw.explicitCommit !== "boolean") return null;
  if (!hasAllowedKeys(raw, ["kind", "intent", "fields", "explicitCommit", "unsupportedFields"], ["operation", "entityReference"]) || !Array.isArray(raw.unsupportedFields) || raw.unsupportedFields.length > 3) return null;
  const intents = ["OPEN", "UPDATE_DRAFT", "COMMIT", "OPEN_UPDATE_COMMIT"] as const;
  if (typeof raw.intent !== "string" || !(intents as readonly string[]).includes(raw.intent)) return null;
  const fields: CustomerCreatePlanFields = {};
  for (const [key, value] of Object.entries(raw.fields)) {
    if (!(CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(key) || !["string", "number", "boolean"].includes(typeof value) || (typeof value === "string" && (!value.trim() || value.length > 500))) return null;
    fields[key as CustomerCreatePlanField] = typeof value === "string" ? value.trim() : value as number | boolean;
  }
  const unsupportedFields: CustomerCreateUnsupportedNotice[] = [];
  for (const notice of raw.unsupportedFields) { void notice; return null; }
  if (raw.explicitCommit !== (raw.intent === "COMMIT" || raw.intent === "OPEN_UPDATE_COMMIT")) return null;
  const operation = raw.operation === undefined ? undefined : ["CREATE", "UPDATE", "ENRICH"].includes(String(raw.operation)) ? raw.operation as "CREATE" | "UPDATE" | "ENRICH" : null;
  if (operation === null || (raw.entityReference !== undefined && (typeof raw.entityReference !== "string" || !raw.entityReference.trim() || raw.entityReference.length > 200))) return null;
  return { kind: "CREATE_PLAN", intent: raw.intent as Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>["intent"], fields, explicitCommit: raw.explicitCommit, unsupportedFields, ...(operation ? { operation } : {}), ...(typeof raw.entityReference === "string" ? { entityReference: raw.entityReference.trim() } : {}) };
}
function hasExactKeys(raw: Record<string, unknown>, expected: readonly string[]) { const keys = Object.keys(raw).sort(); return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]); }
function hasAllowedKeys(raw: Record<string, unknown>, required: readonly string[], optional: readonly string[]) { return required.every((key) => key in raw) && Object.keys(raw).every((key) => required.includes(key) || optional.includes(key)); }
