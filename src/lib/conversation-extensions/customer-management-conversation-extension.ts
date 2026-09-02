import { listCustomers, getCustomer, notifyCreatedCustomerTarget, requestCustomerArchiveAction, confirmCustomerArchiveAction, cancelCustomerArchiveAction, executeCustomerUpdateAction, listCustomerFieldDefinitions, type CustomerRecord } from "@/lib/customers/customers-client";
import type { CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { projectBusinessNavigation } from "@/lib/executive-request-resolution/business-navigation";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { customerCreateConversationCoordinator } from "@/lib/customers/customer-create-conversation-coordinator";
import { extractObviousCustomerCreatePlan, type CustomerCreatePendingContext } from "@/lib/customers/customer-create-conversation-planner";
import type { ConversationExtension } from "./conversation-extension-contract";
import { customerCustomFieldConversationCoordinator } from "@/lib/customers/customer-custom-field-conversation";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { emitCustomerLifecycle, resolveCustomerCorrelationId } from "./conversation-lifecycle-telemetry";
import { customerHandoff, type ConversationExtensionHandoff } from "./conversation-extension-handoff";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace/contracts";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { hasExplicitRevealIntent } from "./reveal-intent";
import { normalizeFieldValue, type ModuleFieldDefinition } from "@/lib/field-authority/field-authority";

let pendingArchive: { customerId: string; displayName: string; approvalId: string } | null = null;
const normalized = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
const confirmWords = /^(evet|onayliyorum|onaylıyorum|onayla|tamam)$/i;
const cancelWords = /^(hayir|hayır|vazgec|vazgeç|iptal)$/i;
type CustomerManagementStage = "attachment" | "custom-field" | "customer-create" | "archive" | "customer-update" | "navigation" | "customer-lookup";
type StageResult = {
  status: "NOT_HANDLED" | "HANDLED_EXECUTED" | "HANDLED_CLARIFICATION" | "HANDLED_FAILED";
  handoff?: ConversationExtensionHandoff;
};

function currentCustomerId(activeWorkspaceContext?: ActiveWorkspaceContext | null): string | null {
  if (activeWorkspaceContext?.domain === "customer" && activeWorkspaceContext.entityId) return activeWorkspaceContext.entityId;
  if (typeof window === "undefined") return null;
  return window.location.pathname.match(/^\/metrix\/customers\/([^/]+)(?:\/edit)?$/)?.[1] ?? null;
}
function navigate(descriptor: CustomerNavigationDescriptor, source: "written" | "voice", correlationId: string) {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    ...projectBusinessNavigation({ domain: "customer", ...descriptor }),
    source,
    correlationId,
  });
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
  async execute(utterance, source = "written", candidateCorrelationId, activeWorkspaceContext) {
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
      if (attachmentResult.handled) {
        const clarification = attachmentResult.outcome === "CLARIFICATION_REQUIRED";
        return {
          status: clarification ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED",
          handoff: customerHandoff({
            operation: "ATTACHMENT",
            outcomeCode: clarification
              ? attachmentResult.candidateNames?.length ? "ATTACHMENT_NOTIFY_AMBIGUOUS" : "ATTACHMENT_NOTIFY_TARGET_REQUIRED"
              : attachmentResult.outcome === "NOTIFY" ? "ATTACHMENT_NOTIFY_DELIVERED" : "ATTACHMENT_EXECUTED",
            resultStatus: clarification ? "CLARIFICATION_REQUIRED" : "EXECUTED",
            entityResolution: clarification ? attachmentResult.candidateNames?.length ? "AMBIGUOUS" : "NOT_FOUND" : "RESOLVED",
            candidateNames: attachmentResult.candidateNames ?? [],
            mutationPerformed: attachmentResult.outcome === "NOTIFY",
          }),
        };
      }
      selectStage("custom-field");
      const customFieldResult = await customerCustomFieldConversationCoordinator.execute(utterance);
      if (customFieldResult.handled) return { status: customFieldResult.status === "FAILED" ? "HANDLED_FAILED" : customFieldResult.status === "CLARIFICATION" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED" };
      selectStage("customer-create");
      const createState = customerCreateConversationCoordinator.store.get();
      if (createState.createdCustomerId && createState.lastRuntimeOutcome?.notificationClarification) {
        const notificationResult = await notifyCreatedCustomerTarget(createState.createdCustomerId, utterance);
        if (!notificationResult.ok) return { status: "HANDLED_FAILED" };
        if (notificationResult.data.status === "CLARIFICATION_REQUIRED") {
          return {
            status: "HANDLED_CLARIFICATION",
            handoff: customerHandoff({ operation: "CREATE", outcomeCode: "CREATE_NOTIFICATION_TARGET_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: notificationResult.data.candidates, mutationPerformed: true }),
          };
        }
        if (notificationResult.data.status === "NOT_FOUND") {
          return {
            status: "HANDLED_CLARIFICATION",
            handoff: customerHandoff({ operation: "CREATE", outcomeCode: "CREATE_NOTIFICATION_TARGET_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND", mutationPerformed: true }),
          };
        }
        const lastRuntimeOutcome = { ...createState.lastRuntimeOutcome };
        delete lastRuntimeOutcome.notificationClarification;
        customerCreateConversationCoordinator.store.patch({ lastRuntimeOutcome });
        return {
          status: "HANDLED_EXECUTED",
          handoff: customerHandoff({ operation: "CREATE", outcomeCode: "CREATE_NOTIFICATION_TARGET_DELIVERED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", candidateNames: [notificationResult.data.recipientName], mutationPerformed: true }),
        };
      }
      const pendingContext: CustomerCreatePendingContext = ["OPENING", "COLLECTING", "READY"].includes(createState.lifecycle)
        ? { lifecycle: createState.lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields: createState.fields, missingFields: createState.missingFields, additionalNotificationTargets: createState.additionalNotificationTargets }
        : null;
      // The local gate is a fast, zero-network pre-check — useful to skip
      // the coordinator's real (LLM-backed) planner call on turns that are
      // obviously unrelated to customer-create. It must never have veto
      // power once an operation is already pending: a hand-maintained
      // regex missing one verb form must not be able to permanently block
      // the coordinator (and its real planner) from ever running, which is
      // exactly what stranded "evet var"/"tamamla" continuation turns with
      // no pending state at all. See METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md §0/§4.
      const createOwnership = extractObviousCustomerCreatePlan(utterance, pendingContext);
      const createResult = !pendingContext && createOwnership.kind === "NOT_CUSTOMER_CREATE"
        ? null
        : await customerCreateConversationCoordinator.execute(utterance, source, correlationId);
      if (createResult?.handled) {
        let entityResolution: ConversationExtensionHandoff["entityResolution"] = createResult.entityAmbiguous ? "AMBIGUOUS" : createResult.hasEntityReference ? "PRESENT" : "UNKNOWN";
        if (createResult.operation === "UPDATE" && createResult.entityReference) {
          const found = await resolve(createResult.entityReference);
          if ("error" in found) entityResolution = "UNKNOWN";
          else entityResolution = found.resolution.status;
        }
        return {
          status: createResult.status === "FAILED" ? "HANDLED_FAILED" : createResult.status === "CLARIFICATION" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED",
          handoff: customerHandoff({
            operationId: createResult.operationId,
            operation: createResult.operation,
            outcomeCode: createResult.outcomeCode,
            resultStatus: createResult.status === "FAILED" ? "FAILED" : createResult.status === "CLARIFICATION" ? "CLARIFICATION_REQUIRED" : createResult.status === "EXECUTED" ? "EXECUTED" : "OBSERVED",
            entityResolution,
            candidateNames: createResult.candidateNames,
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
        navigate({ kind: "customer.detail", customerId: pending.customerId }, source, correlationId);
        return { status: "HANDLED_EXECUTED" };
      }
      if (pendingArchive && cancelWords.test(text)) {
        selectStage("archive");
        const pending = pendingArchive; pendingArchive = null;
        await cancelCustomerArchiveAction(pending.customerId, pending.approvalId);
        return { status: "HANDLED_EXECUTED" };
      }
      // Deliberately "olsun" only (NOT a generic verb like "yap") — this
      // exact grammatical shape ("X'in Y Z olsun") is what already,
      // safely, distinguishes a customer-field-set turn from other
      // domains' conversation extensions (team role changes, etc. use the
      // identical possessive+value grammar with a different closing verb,
      // e.g. "Ayşe'nin rolünü ekip lideri yap" — confirmed by a real
      // regression this session when "yap" was added here: it silently
      // claimed and failed a team-domain turn instead of politely
      // declining so the team extension could handle it). Built-in field
      // updates use this SAME "... olsun." phrasing as custom fields — see
      // buildBuiltInFieldPatch below. An optional trailing reveal clause
      // (closed vocabulary, same as reveal-intent.ts) lets "... olsun,
      // göster." match in one turn — hasExplicitRevealIntent below still
      // does the actual gating, this only keeps the value-set regex from
      // rejecting the turn outright.
      const TRAILING_REVEAL = "(?:\\s*,?\\s*(?:ve\\s+)?(?:göster|goster|kartını\\s+aç|kartini\\s+ac|detayına\\s+bak|detayina\\s+bak|kontrol\\s+edelim))?";
      const contextualCustomValueSet = utterance.match(new RegExp(`^(?:bu|şu|su)\\s+m[üu]şterinin\\s+(.+?)\\s+(.+?)\\s+olsun${TRAILING_REVEAL}[.!]?$`, "iu"));
      const customValueSet = contextualCustomValueSet ? null : utterance.match(new RegExp(`^(.+?)[’'](?:nın|nin|nun|nün|ın|in|un|ün)\\s+(.+?)\\s+(.+?)\\s+olsun${TRAILING_REVEAL}[.!]?$`, "i"));
      const customValueClear = utterance.match(/^(.+?)(?:n[ıi]|y[ıi])\s+temizle[.!]?$/i);
      if (contextualCustomValueSet || customValueSet || customValueClear) {
        selectStage("customer-update");
        const fields = await listCustomerFieldDefinitions(); if (!fields.ok) return { status: "HANDLED_FAILED" };
        const fieldLabel = (contextualCustomValueSet?.[1] ?? customValueSet?.[2] ?? customValueClear?.[1] ?? "").trim();
        // Built-in Background Action Entry: the SAME turn-of-phrase that
        // already resolves a custom field also resolves a built-in one
        // (customer.phone, customer.primaryContact.phone, ...) — the only
        // difference is the patch shape below. Prefer an exact custom-field
        // match (existing, narrower behavior) before falling back to
        // built-ins, so no existing custom-field phrasing changes meaning.
        const customMatches = fields.data.fields.filter((field) => field.custom && [field.label, field.key.replace(/^custom\./, "")].some((value) => normalized(value) === normalized(fieldLabel)));
        const builtInMatches = customMatches.length === 0 ? fields.data.fields.filter((field) => !field.custom && field.writable && [field.label, field.key].some((value) => normalized(value) === normalized(fieldLabel))) : [];
        const fieldMatches = customMatches.length ? customMatches : builtInMatches;
        if (fieldMatches.length !== 1) return { status: "HANDLED_CLARIFICATION" };
        const field = fieldMatches[0]!; if (customValueClear && !field.clearable) return { status: "HANDLED_FAILED" };
        const customerReference = customValueSet?.[1] ?? currentCustomerId(activeWorkspaceContext); if (!customerReference) return { status: "HANDLED_CLARIFICATION" };
        let customer: CustomerRecord | undefined;
        if (customValueSet) { const found = await resolve(customerReference); if ("error" in found) return { status: "HANDLED_FAILED" }; if (found.resolution.status !== "RESOLVED") return { status: "HANDLED_CLARIFICATION" }; const detail = await getCustomer(found.resolution.customer.id); if (!detail.ok) return { status: "HANDLED_FAILED" }; customer = detail.data.customer; } else { const detail = await getCustomer(customerReference); if (!detail.ok) return { status: "HANDLED_FAILED" }; customer = detail.data.customer; }
        if (!customer) return { status: "HANDLED_FAILED" };
        const rawValue = customValueClear ? null : (contextualCustomValueSet?.[2] ?? customValueSet?.[3] ?? "").trim();
        const patch = field.custom
          ? { customFields: [{ definitionId: field.fieldId.replace(/^customer\.custom\./, ""), value: rawValue }] }
          : buildBuiltInFieldPatch(field, rawValue);
        if (!patch) return { status: "HANDLED_CLARIFICATION" };
        const response = await executeCustomerUpdateAction({ customerId: customer.id, patch, expectedVersion: customer.updatedAt, originatingDraftId: crypto.randomUUID(), originatingContextVersion: 1, idempotencyKey: crypto.randomUUID() });
        if (!response.ok || response.data.execution.status !== "SUCCESS") return { status: "HANDLED_FAILED" };
        // Workspace-intent contract: this custom-field update already
        // completed through the canonical Action Runtime with no mounted
        // Surface required — background-safe by default, so it must not
        // auto-open the customer's Workspace just because it succeeded.
        if (hasExplicitRevealIntent(utterance)) navigate({ kind: "customer.detail", customerId: customer.id }, source, correlationId);
        return { status: "HANDLED_EXECUTED" };
      }
      const contextualArchive = /^(?:bu|şu|su)\s+m[üu]şteriyi\s+pasife al[.!]?$/iu.test(utterance);
      const archiveMatch = utterance.match(/^(.+?)\s+müşterisini\s+pasife al$/i) ?? utterance.match(/^(.+?)\s+musterisini\s+pasife al$/i);
      if (contextualArchive || archiveMatch) {
        selectStage("customer-lookup");
        let customer: Pick<CustomerRecord, "id" | "displayName"> | undefined;
        if (contextualArchive) {
          const customerId = activeWorkspaceContext?.domain === "customer" ? activeWorkspaceContext.entityId : null;
          if (!customerId) return { status: "HANDLED_CLARIFICATION" };
          const detail = await getCustomer(customerId); if (!detail.ok) return { status: "HANDLED_FAILED" }; customer = detail.data.customer;
        } else {
          const found = await resolve(archiveMatch![1]!); if ("error" in found) return { status: "HANDLED_FAILED" };
          if (found.resolution.status === "NOT_FOUND") return { status: "HANDLED_CLARIFICATION" };
          if (found.resolution.status === "AMBIGUOUS") return { status: "HANDLED_CLARIFICATION" };
          customer = found.resolution.customer;
        }
        if (!customer) return { status: "HANDLED_FAILED" };
        const approval = await requestCustomerArchiveAction(customer.id);
        if (!approval.ok) return { status: "HANDLED_FAILED" };
        pendingArchive = { customerId: customer.id, displayName: customer.displayName, approvalId: approval.data.approval.approvalId };
        return { status: "HANDLED_CLARIFICATION" };
      }
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
// Built-in Background Action Entry: field.key is already the same dotted
// path CUSTOMER_BUILT_IN_FIELDS/customer-create-conversation-planner.ts use
// ("phone", "primaryContact.phone", ...) — this only converts that dotted
// key into the nested patch shape customerUpdateHandler.ts expects
// ({ primaryContact: { phone } } rather than { "primaryContact.phone" }),
// and reuses the SAME normalizeFieldValue every other field-write path
// already normalizes through. Returns null (clarification, not a guess)
// when the value doesn't normalize — never silently write a raw string.
function buildBuiltInFieldPatch(field: ModuleFieldDefinition, rawValue: string | null): Record<string, unknown> | null {
  if (rawValue === null) {
    const [root, nested] = field.key.split(".");
    return nested ? { [root!]: { [nested]: null } } : { [root!]: null };
  }
  let normalized: unknown;
  try { normalized = normalizeFieldValue(field, rawValue); } catch { return null; }
  const [root, nested] = field.key.split(".");
  return nested ? { [root!]: { [nested]: normalized } } : { [root!]: normalized };
}

function safeNavigationStatus(value: string): ConversationExtensionHandoff["navigationStatus"] {
  return value === "COMPLETED" || value === "FAILED" || value === "EXPIRED" || value === "NOT_REQUESTED" ? value : "UNKNOWN";
}
function handoffForStage(stage: CustomerManagementStage, status: StageResult["status"]): ConversationExtensionHandoff {
  const operation = stage === "navigation" || stage === "customer-lookup" ? "NAVIGATE" : stage === "archive" || stage === "customer-update" ? "UPDATE" : stage === "attachment" ? "ATTACHMENT" : stage === "custom-field" ? "CUSTOM_FIELD" : "UNKNOWN";
  return customerHandoff({
    operation,
    outcomeCode: `${stage.replace(/-/g, "_").toUpperCase()}_${status}`,
    resultStatus: status === "HANDLED_FAILED" ? "FAILED" : status === "HANDLED_CLARIFICATION" ? "CLARIFICATION_REQUIRED" : "EXECUTED",
    mutationPerformed: status === "HANDLED_EXECUTED" && ["archive", "customer-update", "custom-field"].includes(stage),
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
