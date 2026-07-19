import { isRecord } from "@/lib/api/validation";

export const CUSTOMER_CREATE_PLAN_FIELDS = ["displayName", "legalName", "phone", "email", "metrixNote"] as const;
export type CustomerCreatePlanField = (typeof CUSTOMER_CREATE_PLAN_FIELDS)[number];
export type CustomerCreatePlanFields = Partial<Record<CustomerCreatePlanField, string>>;
export type CustomerCreatePlan =
  | { kind: "CREATE_PLAN"; intent: "OPEN" | "UPDATE_DRAFT" | "COMMIT" | "OPEN_UPDATE_COMMIT"; fields: CustomerCreatePlanFields; explicitCommit: boolean }
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
  if (!hasExactKeys(raw, ["kind", "intent", "fields", "explicitCommit"])) return null;
  const intents = ["OPEN", "UPDATE_DRAFT", "COMMIT", "OPEN_UPDATE_COMMIT"] as const;
  if (typeof raw.intent !== "string" || !(intents as readonly string[]).includes(raw.intent)) return null;
  const fields: CustomerCreatePlanFields = {};
  for (const [key, value] of Object.entries(raw.fields)) {
    if (!(CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(key) || typeof value !== "string" || !value.trim()) return null;
    fields[key as CustomerCreatePlanField] = value.trim();
  }
  if (raw.explicitCommit !== (raw.intent === "COMMIT" || raw.intent === "OPEN_UPDATE_COMMIT")) return null;
  return { kind: "CREATE_PLAN", intent: raw.intent as Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>["intent"], fields, explicitCommit: raw.explicitCommit };
}
function hasExactKeys(raw: Record<string, unknown>, expected: readonly string[]) { const keys = Object.keys(raw).sort(); return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]); }
