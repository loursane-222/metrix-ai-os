import { isRecord } from "@/lib/api/validation";
import { CUSTOMER_CREATE_PLAN_FIELDS } from "@/lib/customers/customer-create-conversation-plan";
import { TASK_CREATE_PLAN_FIELDS } from "@/lib/tasks/task-create-conversation-plan";
import { OFFER_EDIT_FIELD_NAMES } from "@/lib/offers/offer-edit-draft";
import type { ActionResultV1 } from "@/lib/action-result/action-result.contracts";
import { recordActionResultTelemetry } from "@/lib/action-result/action-result.telemetry";

export const CONVERSATION_EXTENSION_DOMAINS = ["customers", "tasks", "quotes", "payments", "invoices"] as const;
export type ConversationExtensionDomain = (typeof CONVERSATION_EXTENSION_DOMAINS)[number];

export const CONVERSATION_EXTENSION_OPERATIONS = [
  "CREATE", "UPDATE", "ENRICH", "QUERY", "CANCEL", "NAVIGATE", "ATTACHMENT", "CUSTOM_FIELD", "UNKNOWN",
] as const;

export type ConversationExtensionHandoff = Readonly<{
  domain: ConversationExtensionDomain;
  operation: (typeof CONVERSATION_EXTENSION_OPERATIONS)[number];
  outcomeCode: string;
  resultStatus: "OBSERVED" | "EXECUTED" | "CLARIFICATION_REQUIRED" | "APPROVAL_REQUIRED" | "FAILED";
  entityResolution: "NOT_REQUIRED" | "PRESENT" | "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND" | "UNKNOWN";
  candidateNames: readonly string[];
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
const SAFE_CANDIDATE_NAME = /^[\p{L}\p{N} .,'&/-]{1,120}$/u;

export function validateConversationExtensionHandoff(raw: unknown): ConversationExtensionHandoff | null {
  if (!isRecord(raw)) return null;
  const domain = member(raw.domain, CONVERSATION_EXTENSION_DOMAINS);
  if (!domain) return null;
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
  const candidateNames = raw.candidateNames === undefined ? [] : raw.candidateNames;
  if (!Array.isArray(candidateNames) || candidateNames.length > 5 || !candidateNames.every(isSafeCandidateName)) return null;
  return {
    domain, operation, outcomeCode: raw.outcomeCode, resultStatus, entityResolution,
    candidateNames: Object.freeze([...candidateNames]),
    fieldNames: Object.freeze([...raw.fieldNames]), fieldCount: raw.fieldCount,
    mutationPerformed: raw.mutationPerformed, navigationRequested: raw.navigationRequested,
    navigationStatus, failureCode: raw.failureCode, approvalRequired: raw.approvalRequired,
    certainty, captureOutcome: raw.captureOutcome,
  };
}

export function customerHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  return baseHandoff("customers", input);
}

export function taskHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  return baseHandoff("tasks", input);
}

export function quoteHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  return baseHandoff("quotes", input);
}

export function paymentHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  return baseHandoff("payments", input);
}

export function invoiceHandoff(input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  return baseHandoff("invoices", input);
}

function baseHandoff(domain: ConversationExtensionDomain, input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">): ConversationExtensionHandoff {
  const fieldNames = [...(input.fieldNames ?? [])];
  const candidateNames = [...(input.candidateNames ?? [])].slice(0, 5);
  return {
    domain,
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
    candidateNames,
  };
}

export function projectActionResultToCustomerHandoff(
  result: ActionResultV1,
  operation: ConversationExtensionHandoff["operation"],
): ConversationExtensionHandoff {
  const failed = result.status === "FAILED" || result.status === "BLOCKED" || result.status === "CANCELLED";
  const handoff = customerHandoff({
    operation,
    outcomeCode: outcomeCode(result.status),
    resultStatus: result.status === "WAITING_APPROVAL"
      ? "APPROVAL_REQUIRED"
      : failed ? "FAILED" : "EXECUTED",
    entityResolution: result.target.entityId ? "PRESENT" : "UNKNOWN",
    fieldNames: [...result.mutation.changedFields],
    mutationPerformed: result.mutation.performed,
    failureCode: result.failure.code,
    approvalRequired: result.authorization.approvalRequired,
    captureOutcome: result.mutation.changedFields.length > 0 ? "FIELDS_CAPTURED" : "NONE",
  });
  recordActionResultTelemetry({
    event: "action_result_projected_to_conversation_handoff",
    result,
  });
  return handoff;
}

function outcomeCode(status: ActionResultV1["status"]): string {
  switch (status) {
    case "SUCCEEDED": return "ACTION_SUCCEEDED";
    case "NO_CHANGE": return "ACTION_NO_CHANGE";
    case "WAITING_APPROVAL": return "ACTION_WAITING_APPROVAL";
    case "BLOCKED": return "ACTION_BLOCKED";
    case "CANCELLED": return "ACTION_CANCELLED";
    case "FAILED": return "ACTION_FAILED";
  }
}

function member<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value as T[number] : null;
}

function isSafeCandidateName(value: unknown): value is string {
  return typeof value === "string" && SAFE_CANDIDATE_NAME.test(value);
}

function isSafeCustomerFieldName(value: unknown): value is string {
  return typeof value === "string"
    && SAFE_FIELD.test(value)
    && ((CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(value)
      || (TASK_CREATE_PLAN_FIELDS as readonly string[]).includes(value)
      || (OFFER_EDIT_FIELD_NAMES as readonly string[]).includes(value)
      || value.startsWith("custom."));
}
