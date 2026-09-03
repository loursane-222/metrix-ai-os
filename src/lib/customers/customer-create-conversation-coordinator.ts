import { isRecord } from "@/lib/api/validation";
import { resolveCustomerCreateConversationPlan } from "./customers-client";
import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { extractObviousCustomerCreatePlan, type CustomerCreatePendingContext } from "./customer-create-conversation-planner";
import { CustomerCreateConversationStateStore } from "./customer-create-conversation-state";
import { dispatchCustomerCreateCommand, getActiveCustomerCreateSurfaceDescriptor } from "./customer-create-surface-command-channel";
import { dispatchCustomerNavigation, dispatchCustomerNavigationCommand } from "./customer-navigation-runtime";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { customerTargetId } from "./customer-universal-input-adapter";
import type { ConversationExtensionSource } from "@/lib/conversation-extensions/conversation-extension-contract";
import type { ExecutiveNavigationCompletion } from "@/lib/conversation-extensions/executive-navigation-command";
import { emitCustomerLifecycle, resolveCustomerCorrelationId } from "@/lib/conversation-extensions/conversation-lifecycle-telemetry";
import { resolveCreatePlan, logCreatePlanResolution } from "@/lib/conversation-extensions/create-plan-resolution";
import { hasExplicitRevealIntent, isBareRevealFollowUp } from "@/lib/conversation-extensions/reveal-intent";

// Workspace-intent contract (shared, see reveal-intent.ts): a successful
// create is a background-safe mutation by default — it must not auto-open
// the Customer detail Workspace just because it succeeded. It only
// navigates there when the SAME turn explicitly asked to see/open the
// result ("... oluştur ve göster", "... kaydet, kartını aç"). Bare
// "oluştur"/"kaydet" alone must not open a screen the user never asked to
// see; see the BARE_REVEAL_FOLLOW_UP short-circuit below for how a user who
// changes their mind next turn still gets there without repeating the
// request.

export type CustomerCreateConversationResult = {
  handled: boolean;
  status: "OBSERVED" | "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED";
  operation: "CREATE" | "UPDATE" | "ENRICH" | "QUERY" | "CANCEL" | "UNKNOWN";
  outcomeCode: string;
  fieldNames: string[];
  hasEntityReference: boolean;
  entityReference?: string;
  entityAmbiguous: boolean;
  candidateNames: string[];
  probableClauseCount: number;
  mutationPerformed: boolean;
  navigationRequested: boolean;
  navigationStatus: string;
  failureCode: string | null;
  approvalRequired: boolean;
  // Canonical operation runtime identity for this turn — null only when no
  // pending customer-create operation exists (NOT_HANDLED or a pure
  // read-only query with no active workflow). See
  // customer-create-conversation-state.ts.
  operationId: string | null;
};
type Planner = (utterance: string, pendingContext: CustomerCreatePendingContext, correlationId?: string) => Promise<CustomerCreatePlan>;
type CoordinatorTrace = {
  plan: CustomerCreatePlan | null;
  hadActiveSurface: boolean;
  navigationRequested: boolean;
  navigationStatus: string;
  failureCode: string | null;
};
export class CustomerCreateConversationCoordinator {
  readonly store: CustomerCreateConversationStateStore;
  constructor(private deps: { planner: Planner; navigate: () => boolean; deliver?: (input: Parameters<typeof dispatchCustomerNavigationCommand>[0], navigate: boolean) => Promise<ExecutiveNavigationCompletion> }, store = new CustomerCreateConversationStateStore()) {
    this.store = store;
  }
  dispose() {}
  async execute(utterance: string, source: ConversationExtensionSource = "written", candidateCorrelationId?: string): Promise<CustomerCreateConversationResult> {
    const correlationId = resolveCustomerCorrelationId(candidateCorrelationId);
    const priorLifecycle = this.store.get().lifecycle;
    const trace: CoordinatorTrace = { plan: null, hadActiveSurface: false, navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null };
    emitCustomerLifecycle("CustomerConversation", { event: "coordinator_started", correlationId, source, priorLifecycle });
    try {
      const result = await this.executeTurn(utterance, source, correlationId, trace);
      const plan = trace.plan;
      emitCustomerLifecycle("CustomerConversation", {
        event: "coordinator_completed", correlationId, source,
        planKind: plan?.kind ?? "UNRESOLVED",
        operation: plan?.kind === "CREATE_PLAN" ? plan.operation ?? "UNSPECIFIED" : "NONE",
        intent: plan?.kind === "CREATE_PLAN" ? plan.intent : "NONE",
        semanticStage: plan?.kind === "CREATE_PLAN" ? plan.semantic?.stage ?? "UNKNOWN" : "NONE",
        semanticSource: plan?.kind === "CREATE_PLAN" ? plan.semantic?.source ?? "UNKNOWN" : "NONE",
        semanticConfidence: plan?.kind === "CREATE_PLAN" ? plan.semantic?.confidence ?? "UNKNOWN" : "NONE",
        activeWorkflow: plan?.kind === "CREATE_PLAN" ? plan.semantic?.activeWorkflow ?? false : false,
        explicitCommit: plan?.kind === "CREATE_PLAN" ? plan.explicitCommit : false,
        hasEntityReference: plan?.kind === "CREATE_PLAN" && Boolean(plan.entityReference),
        fieldCount: plan?.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : 0,
        priorLifecycle,
        resultingLifecycle: this.store.get().lifecycle,
        hadActiveSurface: trace.hadActiveSurface,
        navigationRequested: trace.navigationRequested,
        navigationStatus: trace.navigationStatus,
        failureCode: trace.failureCode,
        handled: result.handled,
        resultStatus: result.status,
        canonicalBypass: false,
        operationId: this.store.get().operationId,
      });
      // The store's operationId reflects whatever this turn just did (set
      // fresh on IDLE->OPENING, reused across continuation turns, cleared
      // by reset()/cancel()) — attached once here so every return path
      // (STATUS_QUERY, CLARIFICATION, EXECUTED, FAILED, NOT_HANDLED) is
      // covered without threading it through every individual return site.
      return { ...result, operationId: this.store.get().operationId };
    } catch (cause) {
      emitCustomerLifecycle("CustomerConversation", {
        event: "coordinator_failed", correlationId, source, priorLifecycle,
        resultingLifecycle: this.store.get().lifecycle,
        failureCode: safeCoordinatorFailureCode(cause),
        handled: true, resultStatus: "FAILED", canonicalBypass: false,
      });
      throw cause;
    }
  }
  private async executeTurn(utterance: string, source: ConversationExtensionSource, correlationId: string, trace: CoordinatorTrace): Promise<CustomerCreateConversationResult> {
    const state = this.store.get();
    if (state.lifecycle === "SUCCEEDED" && state.createdCustomerId && isBareRevealFollowUp(utterance)) {
      dispatchCustomerNavigation({ kind: "customer.detail", customerId: state.createdCustomerId });
      return result(true, "EXECUTED", "CREATE", "CREATE_FOLLOW_UP_REVEAL", { navigationRequested: true, navigationStatus: "COMPLETED" });
    }
    const pendingContext = activePendingContext(state.lifecycle, state.fields, state.missingFields, state.additionalNotificationTargets);
    // Canonical operation identity: reused across every turn of the same
    // pending operation (pendingContext active + already minted), minted
    // fresh otherwise (first turn, or a new operation after the previous
    // one succeeded/failed/was cancelled — those clear operationId via
    // reset()/cancel(), so state.operationId is null again by then).
    const operationId = pendingContext && state.operationId ? state.operationId : crypto.randomUUID();
    const resolution = await resolveCreatePlan<CustomerCreatePlan>({
      callPlanner: () => this.deps.planner(utterance, pendingContext, correlationId),
      deterministicFallback: () => extractObviousCustomerCreatePlan(utterance, pendingContext),
      countReliableFields: (candidate) => candidate.kind === "CREATE_PLAN" ? Object.keys(candidate.fields).length : null,
    });
    logCreatePlanResolution("customers", correlationId, resolution);
    if (resolution.source === "FALLBACK_EMPTY") {
      // Planner failed and the deterministic fallback extracted nothing
      // reliable — never reported as EXECUTED/COMPLETED, no surface opened
      // (an empty draft would look like a successful projection with
      // nothing behind it). Honest, natural continuation: the universal
      // handoff message (route.ts) renders CLARIFICATION_REQUIRED with no
      // ambiguous entity as "Devam edebilmem için biraz daha bilgi verir
      // misiniz?" — no capability-denial wording, no fake success. trace.plan
      // stays null, so the caller's own coordinator_completed log (below)
      // already reports this turn correctly without a duplicate emit here.
      return result(true, "CLARIFICATION", "UNKNOWN", "CREATE_PLANNER_DEGRADED", { failureCode: "PLANNER_UNAVAILABLE_NO_RELIABLE_FIELDS" });
    }
    const plan = resolution.plan;
    trace.plan = plan;
    emitCustomerLifecycle("CustomerConversation", {
      event: "planner_resolved", correlationId, source, planKind: plan.kind,
      operation: plan.kind === "CREATE_PLAN" ? plan.operation ?? "UNSPECIFIED" : "NONE",
      intent: plan.kind === "CREATE_PLAN" ? plan.intent : "NONE",
      semanticStage: plan.kind === "CREATE_PLAN" ? plan.semantic?.stage ?? "UNKNOWN" : "NONE",
      semanticSource: plan.kind === "CREATE_PLAN" ? plan.semantic?.source ?? "UNKNOWN" : "NONE",
      semanticConfidence: plan.kind === "CREATE_PLAN" ? plan.semantic?.confidence ?? "UNKNOWN" : "NONE",
      activeWorkflow: plan.kind === "CREATE_PLAN" ? plan.semantic?.activeWorkflow ?? Boolean(pendingContext) : Boolean(pendingContext),
      explicitCommit: plan.kind === "CREATE_PLAN" ? plan.explicitCommit : false,
      hasEntityReference: plan.kind === "CREATE_PLAN" && Boolean(plan.entityReference),
      fieldCount: plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : 0,
    });
    this.store.patch({ lastPlannerOutcome: plan });
    emitCustomerLifecycle("CustomerConversation", { event: "coordinator_branch_selected", correlationId, source, planKind: plan.kind, operation: plan.kind === "CREATE_PLAN" ? plan.operation ?? "UNSPECIFIED" : "NONE" });
    if (plan.kind === "NOT_CUSTOMER_CREATE") return result(false, "NOT_HANDLED", "UNKNOWN", "NOT_CUSTOMER_OPERATION");
    if (plan.kind === "STATUS_QUERY") return result(true, "OBSERVED", "QUERY", "CREATE_WORKFLOW_STATUS", { fieldNames: Object.keys(state.fields) });
    if (plan.kind === "MISSING_FIELDS_QUERY") return result(true, "CLARIFICATION", "QUERY", "CREATE_WORKFLOW_REQUIREMENTS", { fieldNames: state.missingFields });
    if (plan.kind === "CANCEL") { this.store.cancel(); return result(true, "EXECUTED", "CANCEL", "CREATE_WORKFLOW_CANCELLED"); }
    if (plan.kind === "CLARIFICATION_REQUIRED") {
      if (plan.entityAmbiguous && plan.fields && Object.keys(plan.fields).length) {
        const mergedFields = { ...state.fields, ...plan.fields };
        this.store.patch({ fields: mergedFields, missingFields: mergedFields.displayName ? [] : ["displayName"], lifecycle: "COLLECTING", operationId });
      }
      return result(true, "CLARIFICATION", "CREATE", plan.entityAmbiguous ? "CREATE_ENTITY_AMBIGUOUS" : "PLANNER_CLARIFICATION_REQUIRED", { entityAmbiguous: Boolean(plan.entityAmbiguous), candidateNames: plan.candidateNames ?? [] });
    }
    // Production regression: "Atlas'ın telefonunu 0532 444 55 66 yap."
    // opened the "Yeni Müşteri" Workspace instead of a background update.
    // The real (LLM) planner classified operation as CREATE with no
    // independent check that "Atlas" is an existing customer — the only
    // guard was this operation!=="CREATE" gate, which trusts the planner's
    // own self-report. The deterministic classifier (same rules already
    // used as this call's own fallback below) confidently disagrees for
    // this exact shape (explicitUpdateClause in customer-create-semantic-
    // intent.ts: "X'in ... yap/değiştir/güncelle" + a real field payload) —
    // that disagreement is itself strong evidence of a misclassification,
    // not a genuine new-customer request, so it wins over a bare CREATE
    // claim. Only applies to a fresh turn (no pendingContext): an
    // already-active create workflow's continuation is never second-guessed
    // this way, matching the same boundary the local gate in
    // customer-management-conversation-extension.ts already applies.
    const deterministicCrossCheck = !pendingContext && plan.operation === "CREATE" ? extractObviousCustomerCreatePlan(utterance, pendingContext) : null;
    const effectiveOperation = deterministicCrossCheck?.kind === "CREATE_PLAN" ? deterministicCrossCheck.operation : plan.operation;
    // UPDATE is an explicit, actionable mutation command ("X'in Y Z
    // yap/değiştir/güncelle" — explicitUpdateClause above, or the planner's
    // own native UPDATE classification), not passive evidence like ENRICH
    // ("Atlas artık euro ile çalışıyor", a fact stated in passing). This
    // coordinator has no mutation path of its own for an existing entity,
    // so it still can't execute an UPDATE — but it no longer needs its own
    // decline branch to say so: claiming it here as OBSERVED (handled:
    // true, mutationPerformed: false) is safe because
    // isProvisionalConversationHandoff (conversation-extension-handoff.ts)
    // treats exactly this shape — OBSERVED on an actionable CREATE/UPDATE/
    // CANCEL operation with nothing executed — as a PROVISIONAL claim at
    // the shared active-conversation-extension.ts dispatch loop, not a
    // final one. The loop keeps going, reaches the generic orchestration
    // fallback, and lets it resolve the entity for real and execute
    // customer.update through Action Runtime — the same shared mechanism
    // every other domain's background UPDATE already reaches. See that
    // function's own comment for the full arbitration contract; this
    // coordinator does not special-case UPDATE at all anymore.
    if (effectiveOperation !== "CREATE") {
      return result(true, "OBSERVED", effectiveOperation, "CANONICAL_CUSTOMER_EVIDENCE", {
        fieldNames: Object.keys(plan.fields),
        hasEntityReference: Boolean(plan.entityReference),
        ...(plan.entityReference ? { entityReference: plan.entityReference } : {}),
        probableClauseCount: plan.semantic?.probableClauseCount ?? 0,
      });
    }
    const fields = { ...state.fields, ...plan.fields }; const additionalNotificationTargets = [...new Set([...state.additionalNotificationTargets, ...(plan.additionalNotificationTargets ?? [])])]; const missingFields = typeof fields.displayName === "string" && fields.displayName.trim() ? [] : ["displayName" as const];
    const commitAllowed = plan.explicitCommit && plan.unsupportedFields.length === 0 && missingFields.length === 0;
    const lifecycle = missingFields.length ? "COLLECTING" : "READY";
    this.store.patch({ fields, additionalNotificationTargets, missingFields, lifecycle, explicitCommitPending: commitAllowed, pendingReplay: true, lastError: null, operationId });
    const activeSurface = getActiveCustomerCreateSurfaceDescriptor();
    trace.hadActiveSurface = Boolean(activeSurface);
    this.store.patch({ lifecycle: activeSurface ? lifecycle : "OPENING" });
    const changedEntries = Object.entries(activeSurface ? plan.fields : fields);
    const deliveryInput = {
      // The navigation command's correlationId carries the canonical
      // operation identity (not a fresh per-turn value) — this is what lets
      // Surface mount registration (use-customer-create-surface-runtime.ts)
      // and, downstream, commit dispatch, bind to the exact operation that
      // authorized them. See the "Canonical operation identity" section of
      // METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md's successor plan.
      correlationId: operationId, source,
      expectedSurfaceAuthorityKey: "customers.customer.create",
      expectedExecutiveTargetId: customerTargetId("create", "surface", "form"),
      batch: changedEntries.map(([field, value]) => ({ type: "SET" as const, executiveTargetId: customerTargetId("create", "field", `customer.${field}`), value })),
      finalFocusTargetId: changedEntries[0] ? customerTargetId("create", "field", `customer.${changedEntries[0][0]}`) : undefined,
    };
    trace.navigationRequested = !activeSurface;
    emitCustomerLifecycle("CustomerConversation", { event: "delivery_requested", correlationId, source, hadActiveSurface: Boolean(activeSurface), navigationRequested: !activeSurface, operation: plan.operation ?? "UNSPECIFIED", fieldCount: changedEntries.length });
    if (!this.deps.deliver) {
      const result = await this.executeLegacyDelivery(plan, changedEntries, activeSurface, utterance);
      trace.navigationStatus = result.status === "FAILED" ? "FAILED" : "COMPLETED";
      trace.failureCode = result.status === "FAILED" ? "LEGACY_NAVIGATION_FAILED" : null;
      emitCustomerLifecycle("CustomerConversation", { event: "delivery_completed", correlationId, source, navigationStatus: trace.navigationStatus, failureCode: trace.failureCode, handled: result.handled, resultStatus: result.status, canonicalBypass: false });
      return { ...result, navigationRequested: trace.navigationRequested, navigationStatus: trace.navigationStatus, failureCode: trace.failureCode };
    }
    const navigation = await this.deps.deliver(deliveryInput, !activeSurface);
    trace.navigationStatus = navigation.status;
    trace.failureCode = navigationFailureCode(navigation.status);
    emitCustomerLifecycle("CustomerConversation", { event: "delivery_completed", correlationId, source, navigationStatus: navigation.status, failureCode: trace.failureCode, changedTargetCount: navigation.changedExecutiveTargetIds.length });
    if (navigation.status !== "COMPLETED") return this.navigationFail(trace.failureCode ?? "NAVIGATION_FAILED", navigation.status);
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) { trace.navigationStatus = "FAILED"; trace.failureCode = "SURFACE_NOT_ACTIVE"; return this.navigationFail("SURFACE_NOT_ACTIVE"); }
    if (additionalNotificationTargets.length) await dispatchCustomerCreateCommand(surface.token, { type: "set_notification_targets", targets: additionalNotificationTargets }, operationId);
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !activeSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return result(true, plan.unsupportedFields.length ? "CLARIFICATION" : "EXECUTED", "CREATE", "CREATE_DRAFT_READY", { fieldNames: Object.keys(plan.fields), navigationRequested: trace.navigationRequested, navigationStatus: trace.navigationStatus }); }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return result(true, "CLARIFICATION", "CREATE", "CREATE_DISPLAY_NAME_REQUIRED", { fieldNames: ["displayName"], navigationRequested: trace.navigationRequested, navigationStatus: trace.navigationStatus }); }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" }, operationId);
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.fail("CREATE_EXECUTION_FAILED", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    if (hasExplicitRevealIntent(utterance)) dispatchCustomerNavigation(outcome.navigation);
    if (outcome.notificationClarification) return result(true, "CLARIFICATION", "CREATE", "CREATE_NOTIFICATION_TARGET_CLARIFICATION_REQUIRED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, entityAmbiguous: outcome.notificationClarification.candidateNames.length > 0, candidateNames: outcome.notificationClarification.candidateNames, navigationRequested: trace.navigationRequested, navigationStatus: "COMPLETED" });
    return result(true, "EXECUTED", "CREATE", "CREATE_COMMITTED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, navigationRequested: trace.navigationRequested, navigationStatus: "COMPLETED" });
  }
  private async executeLegacyDelivery(plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>, changedEntries: [string, unknown][], initialSurface: ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>, utterance: string): Promise<CustomerCreateConversationResult> {
    if (!initialSurface && !this.deps.navigate()) return this.navigationFail("LEGACY_NAVIGATION_FAILED");
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) return this.navigationFail("SURFACE_NOT_ACTIVE");
    // Test-only path (production always sets deps.deliver) — operationId is
    // whatever executeTurn already patched into the store before calling
    // this method, so read it back rather than threading a new parameter.
    const legacyOperationId = this.store.get().operationId;
    for (const [field, value] of changedEntries) {
      const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "set_field", field: field as keyof CustomerCreatePlanFields, value: value! }, legacyOperationId);
      if (outcome.status !== "EXECUTED") return this.legacyFail("CREATE_DRAFT_DELIVERY_FAILED", outcome);
    }
    const notificationTargets = this.store.get().additionalNotificationTargets;
    if (notificationTargets.length) await dispatchCustomerCreateCommand(surface.token, { type: "set_notification_targets", targets: notificationTargets }, legacyOperationId);
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !initialSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return result(true, plan.unsupportedFields.length ? "CLARIFICATION" : "EXECUTED", "CREATE", "CREATE_DRAFT_READY", { fieldNames: Object.keys(plan.fields), navigationRequested: !initialSurface, navigationStatus: "COMPLETED" }); }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return result(true, "CLARIFICATION", "CREATE", "CREATE_DISPLAY_NAME_REQUIRED", { fieldNames: ["displayName"], navigationRequested: !initialSurface, navigationStatus: "COMPLETED" }); }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" }, legacyOperationId);
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.legacyFail("CREATE_EXECUTION_FAILED", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    if (hasExplicitRevealIntent(utterance)) dispatchCustomerNavigation(outcome.navigation);
    if (outcome.notificationClarification) return result(true, "CLARIFICATION", "CREATE", "CREATE_NOTIFICATION_TARGET_CLARIFICATION_REQUIRED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, entityAmbiguous: outcome.notificationClarification.candidateNames.length > 0, candidateNames: outcome.notificationClarification.candidateNames, navigationRequested: !initialSurface, navigationStatus: "COMPLETED" });
    return result(true, "EXECUTED", "CREATE", "CREATE_COMMITTED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, navigationRequested: !initialSurface, navigationStatus: "COMPLETED" });
  }
  private legacyFail(code: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: code, lastRuntimeOutcome: outcome ?? null }); return result(true, "FAILED", "CREATE", code, { failureCode: code }); }
  private fail(code: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: code, lastRuntimeOutcome: outcome ?? null }); return result(true, "FAILED", "CREATE", code, { failureCode: code }); }
  private navigationFail(failureCode: string, navigationStatus: string = "FAILED"): CustomerCreateConversationResult {
    this.store.reset();
    return result(true, "FAILED", "CREATE", "CREATE_NAVIGATION_FAILED", { navigationRequested: true, navigationStatus, failureCode });
  }
}
function result(handled: boolean, status: CustomerCreateConversationResult["status"], operation: CustomerCreateConversationResult["operation"], outcomeCode: string, extra: Partial<CustomerCreateConversationResult> = {}): CustomerCreateConversationResult {
  return { handled, status, operation, outcomeCode, fieldNames: [], hasEntityReference: false, entityAmbiguous: false, candidateNames: [], probableClauseCount: 0, mutationPerformed: false, navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false, operationId: null, ...extra };
}
function activePendingContext(lifecycle: string, fields: CustomerCreatePlanFields, missingFields: Array<"displayName">, additionalNotificationTargets: string[]): CustomerCreatePendingContext { return ["OPENING", "COLLECTING", "READY"].includes(lifecycle) ? { lifecycle: lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields, additionalNotificationTargets } : null; }
function navigationFailureCode(status: ExecutiveNavigationCompletion["status"]): string | null { if (status === "EXPIRED") return "NAVIGATION_EXPIRED"; if (status === "FAILED" || status === "SUPERSEDED") return "NAVIGATION_FAILED"; return null; }
function safeCoordinatorFailureCode(cause: unknown): string { if (cause && typeof cause === "object" && "code" in cause) { const code = Reflect.get(cause, "code"); if (typeof code === "string" && /^[A-Z0-9_-]{1,64}$/u.test(code)) return code; } return "UNKNOWN_NAVIGATION_FAILURE"; }
async function productionPlanner(utterance: string, pendingContext: CustomerCreatePendingContext, correlationId?: string): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingContext }, correlationId); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); if (plan.kind !== "CREATE_PLAN" || !isRecord(response.data.capture)) return plan; const capture = response.data.capture; if (!isRecord(capture.result) || !Array.isArray(capture.result.draftOperations)) throw new Error("INVALID_CAPTURE_RESULT"); if (capture.result.userInteraction === "CONFIRMATION" || capture.result.userInteraction === "APPROVAL" || capture.result.userInteraction === "CLARIFICATION") { const entityResolution = isRecord(capture.result.entityResolution) ? capture.result.entityResolution : null; const entityAmbiguous = entityResolution?.status === "AMBIGUOUS"; const candidateNames = entityAmbiguous && Array.isArray(entityResolution.candidates) ? entityResolution.candidates.map((candidate) => isRecord(candidate) && typeof candidate.displayName === "string" ? candidate.displayName : null).filter((name): name is string => Boolean(name)).slice(0, 5) : []; const knownFields: CustomerCreatePlanFields = {}; if (entityAmbiguous && Array.isArray(capture.result.resolvedCandidates)) { for (const candidate of capture.result.resolvedCandidates) { if (!isRecord(candidate) || typeof candidate.fieldId !== "string") continue; const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === candidate.fieldId); const value = typeof candidate.normalizedValue === "string" || typeof candidate.normalizedValue === "number" || typeof candidate.normalizedValue === "boolean" ? candidate.normalizedValue : typeof candidate.rawValue === "string" ? candidate.rawValue : null; if (field && value !== null) knownFields[field.key as keyof CustomerCreatePlanFields] = value as never; } } return { kind: "CLARIFICATION_REQUIRED", reason: typeof capture.deltaConfirmation === "string" ? capture.deltaConfirmation : "Değişen alanlar onay bekliyor.", ...(entityAmbiguous ? { entityAmbiguous: true as const, candidateNames, ...(Object.keys(knownFields).length ? { fields: knownFields } : {}) } : {}) }; } const fields: CustomerCreatePlanFields = {}; for (const operation of capture.result.draftOperations) { if (!isRecord(operation) || typeof operation.fieldId !== "string") throw new Error("INVALID_CAPTURE_OPERATION"); const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === operation.fieldId); if (field && (operation.kind === "SET" || operation.kind === "CLEAR")) fields[field.key as keyof CustomerCreatePlanFields] = (operation.kind === "CLEAR" ? "" : operation.value) as never; } return { ...plan, fields }; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }), deliver: dispatchCustomerNavigationCommand });
