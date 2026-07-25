import { listCustomers, getCustomer, requestCustomerArchiveAction, confirmCustomerArchiveAction, cancelCustomerArchiveAction, executeCustomerUpdateAction, listCustomerFieldDefinitions, type CustomerRecord } from "@/lib/customers/customers-client";
import { buildCustomerRoute, type CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { customerCreateConversationCoordinator } from "@/lib/customers/customer-create-conversation-coordinator";
import type { ConversationExtension } from "./conversation-extension-contract";
import { customerCustomFieldConversationCoordinator } from "@/lib/customers/customer-custom-field-conversation";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { emitCustomerLifecycle, resolveCustomerCorrelationId } from "./conversation-lifecycle-telemetry";
import { customerHandoff, type ConversationExtensionHandoff } from "./conversation-extension-handoff";

let pendingArchive: { customerId: string; displayName: string; approvalId: string } | null = null;
const normalized = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
const confirmWords = /^(evet|onayliyorum|onaylıyorum|onayla|tamam)$/i;
const cancelWords = /^(hayir|hayır|vazgec|vazgeç|iptal)$/i;
type CustomerManagementStage = "attachment" | "custom-field" | "customer-create" | "archive" | "customer-update" | "navigation" | "customer-lookup";
type StageResult = {
  status: "NOT_HANDLED" | "HANDLED_EXECUTED" | "HANDLED_CLARIFICATION" | "HANDLED_FAILED";
  handoff?: ConversationExtensionHandoff;
};

function currentCustomerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname.match(/^\/metrix\/customers\/([^/]+)(?:\/edit)?$/)?.[1] ?? null;
}
function navigate(descriptor: CustomerNavigationDescriptor) {
  if (typeof window !== "undefined") window.location.assign(buildCustomerRoute(descriptor));
}
async function resolve(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

export const customerManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `customers-management:${window.location.pathname}`;
  },
  async execute(utterance, source = "written", candidateCorrelationId) {
    const correlationId = resolveCustomerCorrelationId(candidateCorrelationId);
    const text = normalized(utterance);
    let stage: CustomerManagementStage = "attachment";
    const selectStage = (next: CustomerManagementStage) => {
      stage = next;
      emitCustomerLifecycle("CustomerConversationExtension", { event: "stage_selected", correlationId, source, stage });
    };
    emitCustomerLifecycle("CustomerConversationExtension", { event: "extension_started", correlationId, source });
    selectStage("attachment");
    try {
      const result: StageResult = await (async () => {
      const attachmentResult = await customerAttachmentConversationCoordinator.execute(utterance);
      if (attachmentResult.handled) return { status: attachmentResult.outcome === "CLARIFICATION_REQUIRED" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED" };
      selectStage("custom-field");
      const customFieldResult = await customerCustomFieldConversationCoordinator.execute(utterance);
      if (customFieldResult.handled) return { status: customFieldResult.status === "FAILED" ? "HANDLED_FAILED" : customFieldResult.status === "CLARIFICATION" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED" };
      selectStage("customer-create");
      const createResult = await customerCreateConversationCoordinator.execute(utterance, source, correlationId);
      if (createResult.handled) {
        let entityResolution: ConversationExtensionHandoff["entityResolution"] = createResult.hasEntityReference ? "PRESENT" : "UNKNOWN";
        if (createResult.operation === "UPDATE" && createResult.entityReference) {
          const found = await resolve(createResult.entityReference);
          if ("error" in found) entityResolution = "UNKNOWN";
          else entityResolution = found.resolution.status;
        }
        return {
          status: createResult.status === "FAILED" ? "HANDLED_FAILED" : createResult.status === "CLARIFICATION" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED",
          handoff: customerHandoff({
            operation: createResult.operation,
            outcomeCode: createResult.outcomeCode,
            resultStatus: createResult.status === "FAILED" ? "FAILED" : createResult.status === "CLARIFICATION" ? "CLARIFICATION_REQUIRED" : createResult.status === "EXECUTED" ? "EXECUTED" : "OBSERVED",
            entityResolution,
            fieldNames: createResult.fieldNames,
            mutationPerformed: createResult.mutationPerformed,
            navigationRequested: createResult.navigationRequested,
            navigationStatus: safeNavigationStatus(createResult.navigationStatus),
            failureCode: createResult.failureCode,
            approvalRequired: createResult.approvalRequired,
            certainty: createResult.probableClauseCount > 0 ? "PROBABLE_CONTEXT_PRESENT" : "CERTAIN",
            captureOutcome: createResult.fieldNames.length ? "FIELDS_CAPTURED" : "NONE",
          }),
        };
      }
      if (pendingArchive && confirmWords.test(text)) {
        selectStage("archive");
        const pending = pendingArchive;
        const response = await confirmCustomerArchiveAction(pending.customerId, pending.approvalId);
        if (!response.ok) return { status: "HANDLED_FAILED" };
        pendingArchive = null;
        navigate({ kind: "customer.detail", customerId: pending.customerId });
        return { status: "HANDLED_EXECUTED" };
      }
      if (pendingArchive && cancelWords.test(text)) {
        selectStage("archive");
        const pending = pendingArchive; pendingArchive = null;
        await cancelCustomerArchiveAction(pending.customerId, pending.approvalId);
        return { status: "HANDLED_EXECUTED" };
      }
      const customValueSet = utterance.match(/^(.+?)[’'](?:nın|nin|nun|nün)\s+(.+?)\s+(.+?)\s+olsun[.!]?$/i);
      const customValueClear = utterance.match(/^(.+?)(?:n[ıi]|y[ıi])\s+temizle[.!]?$/i);
      if (customValueSet || customValueClear) {
        selectStage("customer-update");
        const fields = await listCustomerFieldDefinitions(); if (!fields.ok) return { status: "HANDLED_FAILED" };
        const fieldLabel = (customValueSet?.[2] ?? customValueClear?.[1] ?? "").trim(); const fieldMatches = fields.data.fields.filter((field) => field.custom && [field.label, field.key.replace(/^custom\./, "")].some((value) => normalized(value) === normalized(fieldLabel)));
        if (fieldMatches.length !== 1) return { status: "HANDLED_CLARIFICATION" };
        const field = fieldMatches[0]!; if (customValueClear && !field.clearable) return { status: "HANDLED_FAILED" };
        const customerReference = customValueSet?.[1] ?? currentCustomerId(); if (!customerReference) return { status: "HANDLED_CLARIFICATION" };
        let customer: CustomerRecord | undefined;
        if (customValueSet) { const found = await resolve(customerReference); if ("error" in found) return { status: "HANDLED_FAILED" }; if (found.resolution.status !== "RESOLVED") return { status: "HANDLED_CLARIFICATION" }; const detail = await getCustomer(found.resolution.customer.id); if (!detail.ok) return { status: "HANDLED_FAILED" }; customer = detail.data.customer; } else { const detail = await getCustomer(customerReference); if (!detail.ok) return { status: "HANDLED_FAILED" }; customer = detail.data.customer; }
        if (!customer) return { status: "HANDLED_FAILED" };
        const definitionId = field.fieldId.replace(/^customer\.custom\./, ""); const value = customValueClear ? null : customValueSet![3]!.trim(); const response = await executeCustomerUpdateAction({ customerId: customer.id, patch: { customFields: [{ definitionId, value }] }, expectedVersion: customer.updatedAt, originatingDraftId: crypto.randomUUID(), originatingContextVersion: 1, idempotencyKey: crypto.randomUUID() });
        if (!response.ok || response.data.execution.status !== "SUCCESS") return { status: "HANDLED_FAILED" };
        navigate({ kind: "customer.detail", customerId: customer.id }); return { status: "HANDLED_EXECUTED" };
      }
      if (/musteri(ler)?( listesini)? (ac|goster)|musterilere git/.test(text)) { selectStage("navigation"); navigate({ kind: "customers.list" }); return { status: "HANDLED_EXECUTED" }; }
      const archiveMatch = utterance.match(/^(.+?)\s+müşterisini\s+pasife al$/i) ?? utterance.match(/^(.+?)\s+musterisini\s+pasife al$/i);
      if (archiveMatch) {
        selectStage("customer-lookup");
        const found = await resolve(archiveMatch[1]!); if ("error" in found) return { status: "HANDLED_FAILED" };
        if (found.resolution.status === "NOT_FOUND") return { status: "HANDLED_CLARIFICATION" };
        if (found.resolution.status === "AMBIGUOUS") return { status: "HANDLED_CLARIFICATION" };
        const customer = found.resolution.customer; const approval = await requestCustomerArchiveAction(customer.id);
        if (!approval.ok) return { status: "HANDLED_FAILED" };
        pendingArchive = { customerId: customer.id, displayName: customer.displayName, approvalId: approval.data.approval.approvalId };
        return { status: "HANDLED_CLARIFICATION" };
      }
      const intent = utterance.match(/^(.+?)\s+müşterisini\s+(aç|duzenle|düzenle|özetle|ozetle)$/i) ?? utterance.match(/^(.+?)\s+musterisini\s+(ac|duzenle|ozetle)$/i);
      if (intent) {
        selectStage("customer-lookup");
        const found = await resolve(intent[1]!); if ("error" in found) return { status: "HANDLED_FAILED" };
        if (found.resolution.status === "NOT_FOUND") return { status: "HANDLED_CLARIFICATION" };
        if (found.resolution.status === "AMBIGUOUS") return { status: "HANDLED_CLARIFICATION" };
        const customer = found.resolution.customer;
        if (/özetle|ozetle/i.test(intent[2]!)) { const detail = await getCustomer(customer.id); return detail.ok ? { status: "HANDLED_EXECUTED" } : { status: "HANDLED_FAILED" }; }
        selectStage("navigation"); navigate({ kind: /duzenle|düzenle/i.test(intent[2]!) ? "customer.edit" : "customer.detail", customerId: customer.id });
        return { status: "HANDLED_EXECUTED" };
      }
      const currentId = currentCustomerId();
      if (currentId && /bu musteriyi (duzenle|düzenle)/.test(text)) { selectStage("navigation"); navigate({ kind: "customer.edit", customerId: currentId }); return { status: "HANDLED_EXECUTED" }; }
      return { status: "NOT_HANDLED" };
      })();
      const handled = result.status !== "NOT_HANDLED";
      const handoff = handled ? result.handoff ?? handoffForStage(stage, result.status) : null;
      emitCustomerLifecycle("CustomerConversationExtension", { event: "stage_result", correlationId, source, stage, resultStatus: result.status, handled, canonicalBypass: false });
      emitCustomerLifecycle("CustomerConversationExtension", { event: "canonical_handoff", correlationId, source, stage, resultStatus: result.status, handled, canonicalBypass: false, assistantOwner: "CANONICAL_CHAT" });
      emitCustomerLifecycle("CustomerConversationExtension", { event: "extension_completed", correlationId, source, stage, resultStatus: result.status, handled, canonicalBypass: false });
      return handled ? { status: "HANDOFF", handoff } : { status: "NOT_HANDLED", handoff: null };
    } catch (cause: unknown) {
      const error = sanitizeCustomerManagementError(cause);
      console.error("[CustomerManagementExtension] operation failed", { ...error, stage });
      const failureCode = error.errorName === "NavigationError" ? "LEGACY_NAVIGATION_FAILED" : "UNKNOWN_NAVIGATION_FAILURE";
      emitCustomerLifecycle("CustomerConversationExtension", { event: "extension_failed", correlationId, source, stage, resultStatus: "HANDLED_FAILED", handled: true, canonicalBypass: false, failureCode, assistantOwner: "CANONICAL_CHAT" });
      return { status: "HANDOFF", handoff: customerHandoff({ operation: String(stage) === "navigation" ? "NAVIGATE" : "UNKNOWN", outcomeCode: "CUSTOMER_EXTENSION_FAILED", resultStatus: "FAILED", failureCode }) };
    }
  },
  reset() { resetCustomerManagementConversationForTests(); },
};
function safeNavigationStatus(value: string): ConversationExtensionHandoff["navigationStatus"] {
  return value === "COMPLETED" || value === "FAILED" || value === "EXPIRED" || value === "NOT_REQUESTED" ? value : "UNKNOWN";
}
function handoffForStage(stage: CustomerManagementStage, status: StageResult["status"]): ConversationExtensionHandoff {
  const operation = stage === "navigation" || stage === "customer-lookup" ? "NAVIGATE" : stage === "archive" || stage === "customer-update" ? "UPDATE" : stage === "attachment" ? "ATTACHMENT" : stage === "custom-field" ? "CUSTOM_FIELD" : "UNKNOWN";
  return customerHandoff({
    operation,
    outcomeCode: `${stage.replace(/-/g, "_").toUpperCase()}_${status}`,
    resultStatus: status === "HANDLED_FAILED" ? "FAILED" : status === "HANDLED_CLARIFICATION" ? "CLARIFICATION_REQUIRED" : "EXECUTED",
    mutationPerformed: status === "HANDLED_EXECUTED" && ["archive", "customer-update", "custom-field", "attachment"].includes(stage),
    navigationRequested: stage === "navigation",
    navigationStatus: stage === "navigation" ? "COMPLETED" : "NOT_REQUESTED",
    approvalRequired: status === "HANDLED_CLARIFICATION" && ["archive", "custom-field", "attachment"].includes(stage),
  });
}
function sanitizeCustomerManagementError(cause: unknown): { errorName: string; errorMessage: string } {
  const rawName = cause instanceof Error ? cause.name : "UnknownError";
  const rawMessage = cause instanceof Error ? cause.message : "Unknown failure";
  const navigation = /navigation|router|route/i.test(`${rawName} ${rawMessage}`);
  return {
    errorName: navigation ? "NavigationError" : safeErrorName(rawName),
    errorMessage: navigation ? "Navigation request failed" : safeErrorCode(cause),
  };
}
function safeErrorName(value: string): string {
  return /^(?:Error|[A-Za-z][A-Za-z0-9]*Error)$/.test(value) ? value.slice(0, 80) : "UnknownError";
}
function safeErrorCode(cause: unknown): string {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return "Unexpected operation failure";
  const code = Reflect.get(cause, "code");
  return typeof code === "string" && /^[A-Z0-9_-]{1,64}$/.test(code) ? code : "Unexpected operation failure";
}
export function resetCustomerManagementConversationForTests() { pendingArchive = null; customerCreateConversationCoordinator.store.reset(); customerCustomFieldConversationCoordinator.reset(); customerAttachmentConversationCoordinator.reset(); }
