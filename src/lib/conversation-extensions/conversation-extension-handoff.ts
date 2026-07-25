import { isRecord } from "@/lib/api/validation";
import { CUSTOMER_CREATE_PLAN_FIELDS } from "@/lib/customers/customer-create-conversation-plan";

export const CONVERSATION_EXTENSION_OPERATIONS = [
  "CREATE", "UPDATE", "ENRICH", "QUERY", "CANCEL", "NAVIGATE", "ATTACHMENT", "CUSTOM_FIELD", "UNKNOWN",
] as const;

export type ConversationExtensionHandoff = Readonly<{
  domain: "customers";
  operation: (typeof CONVERSATION_EXTENSION_OPERATIONS)[number];
  outcomeCode: string;
  resultStatus: "OBSERVED" | "EXECUTED" | "CLARIFICATION_REQUIRED" | "APPROVAL_REQUIRED" | "FAILED";
  entityResolution: "NOT_REQUIRED" | "PRESENT" | "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND" | "UNKNOWN";
  fieldNames: readonly string[];
  fieldCount: number;
  mutationPerformed: boolean;
  navigationRequested: boolean;
  navigationStatus: "NOT_REQUESTED" | "COMPLETED" | "FAILED" | "EXPIRED" | "UNKNOWN";
  failureCode: string | null;
  approvalRequired: boolean;
  certainty: "CERTAIN" | "PROBABLE_CONTEXT_PRESENT" | "UNKNOWN";
  captureOutcome: string;
}>;

const SAFE_CODE = /^[A-Z0-9_-]{1,80}$/u;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_.]{0,79}$/u;

export function validateConversationExtensionHandoff(raw: unknown): ConversationExtensionHandoff | null {
  if (!isRecord(raw) || raw.domain !== "customers") return null;
  const operation = member(raw.operation, CONVERSATION_EXTENSION_OPERATIONS);
  const resultStatus = member(raw.resultStatus, ["OBSERVED", "EXECUTED", "CLARIFICATION_REQUIRED", "APPROVAL_REQUIRED", "FAILED"] as const);
  const entityResolution = member(raw.entityResolution, ["NOT_REQUIRED", "PRESENT", "RESOLVED", "AMBIGUOUS", "NOT_FOUND", "UNKNOWN"] as const);
  const navigationStatus = member(raw.navigationStatus, ["NOT_REQUESTED", "COMPLETED", "FAILED", "EXPIRED", "UNKNOWN"] as const);
  const certainty = member(raw.certainty, ["CERTAIN", "PROBABLE_CONTEXT_PRESENT", "UNKNOWN"] as const);
  if (!operation || !resultStatus || !entityResolution || !navigationStatus || !certainty) return null;
  if (typeof raw.outcomeCode !== "string" || !SAFE_CODE.test(raw.outcomeCode) || typeof raw.captureOutcome !== "string" || !SAFE_CODE.test(raw.captureOutcome)) return null;
  if (!Array.isArray(raw.fieldNames) || raw.fieldNames.length > 32 || !raw.fieldNames.every(isSafeCustomerFieldName)) return null;
  if (raw.fieldCount !== raw.fieldNames.length || typeof raw.mutationPerformed !== "boolean" || typeof raw.navigationRequested !== "boolean" || typeof raw.approvalRequired !== "boolean") return null;
  if (raw.failureCode !== null && (typeof raw.failureCode !== "string" || !SAFE_CODE.test(raw.failureCode))) return null;
  return {
    domain: "customers", operation, outcomeCode: raw.outcomeCode, resultStatus, entityResolution,
    fieldNames: Object.freeze([...raw.fieldNames]), fieldCount: raw.fieldCount,
    mutationPerformed: raw.mutationPerformed, navigationRequested: raw.navigationRequested,
    navigationStatus, failureCode: raw.failureCode, approvalRequired: raw.approvalRequired,
    certainty, captureOutcome: raw.captureOutcome,
  };
}

export function customerHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  const fieldNames = [...(input.fieldNames ?? [])];
  return {
    domain: "customers",
    entityResolution: "UNKNOWN",
    mutationPerformed: false,
    navigationRequested: false,
    navigationStatus: "NOT_REQUESTED",
    failureCode: null,
    approvalRequired: false,
    certainty: "CERTAIN",
    captureOutcome: "NONE",
    ...input,
    fieldNames,
    fieldCount: fieldNames.length,
  };
}

function member<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value as T[number] : null;
}

function isSafeCustomerFieldName(value: unknown): value is string {
  return typeof value === "string"
    && SAFE_FIELD.test(value)
    && ((CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(value) || value.startsWith("custom."));
}
