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

export type CustomerCreateConversationResult = {
  handled: boolean;
  status: "OBSERVED" | "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED";
  operation: "CREATE" | "UPDATE" | "ENRICH" | "QUERY" | "CANCEL" | "UNKNOWN";
  outcomeCode: string;
  fieldNames: string[];
  hasEntityReference: boolean;
  entityReference?: string;
  probableClauseCount: number;
  mutationPerformed: boolean;
  navigationRequested: boolean;
  navigationStatus: string;
  failureCode: string | null;
  approvalRequired: boolean;
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
      });
      return result;
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
    let plan: CustomerCreatePlan;
    const pendingContext = activePendingContext(state.lifecycle, state.fields, state.missingFields);
    try { plan = await this.deps.planner(utterance, pendingContext, correlationId); } catch { plan = extractObviousCustomerCreatePlan(utterance, pendingContext); }
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
    if (plan.kind === "CLARIFICATION_REQUIRED") return result(true, "CLARIFICATION", "UNKNOWN", "PLANNER_CLARIFICATION_REQUIRED");
    if (plan.operation !== "CREATE") {
      return result(true, "OBSERVED", plan.operation, "CANONICAL_CUSTOMER_EVIDENCE", {
        fieldNames: Object.keys(plan.fields),
        hasEntityReference: Boolean(plan.entityReference),
        ...(plan.entityReference ? { entityReference: plan.entityReference } : {}),
        probableClauseCount: plan.semantic?.probableClauseCount ?? 0,
      });
    }
    const fields = { ...state.fields, ...plan.fields }; const missingFields = typeof fields.displayName === "string" && fields.displayName.trim() ? [] : ["displayName" as const];
    const commitAllowed = plan.explicitCommit && plan.unsupportedFields.length === 0 && missingFields.length === 0;
    const lifecycle = missingFields.length ? "COLLECTING" : "READY";
    this.store.patch({ fields, missingFields, lifecycle, explicitCommitPending: commitAllowed, pendingReplay: true, lastError: null });
    const activeSurface = getActiveCustomerCreateSurfaceDescriptor();
    trace.hadActiveSurface = Boolean(activeSurface);
    this.store.patch({ lifecycle: activeSurface ? lifecycle : "OPENING" });
    const changedEntries = Object.entries(plan.fields);
    const deliveryInput = {
      correlationId, source,
      expectedSurfaceAuthorityKey: "customers.customer.create",
      expectedExecutiveTargetId: customerTargetId("create", "surface", "form"),
      batch: changedEntries.map(([field, value]) => ({ type: "SET" as const, executiveTargetId: customerTargetId("create", "field", `customer.${field}`), value })),
      finalFocusTargetId: changedEntries[0] ? customerTargetId("create", "field", `customer.${changedEntries[0][0]}`) : undefined,
    };
    trace.navigationRequested = !activeSurface;
    emitCustomerLifecycle("CustomerConversation", { event: "delivery_requested", correlationId, source, hadActiveSurface: Boolean(activeSurface), navigationRequested: !activeSurface, operation: plan.operation ?? "UNSPECIFIED", fieldCount: changedEntries.length });
    if (!this.deps.deliver) {
      const result = await this.executeLegacyDelivery(plan, changedEntries, activeSurface);
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
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !activeSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return result(true, plan.unsupportedFields.length ? "CLARIFICATION" : "EXECUTED", "CREATE", "CREATE_DRAFT_READY", { fieldNames: Object.keys(plan.fields), navigationRequested: trace.navigationRequested, navigationStatus: trace.navigationStatus }); }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return result(true, "CLARIFICATION", "CREATE", "CREATE_DISPLAY_NAME_REQUIRED", { fieldNames: ["displayName"], navigationRequested: trace.navigationRequested, navigationStatus: trace.navigationStatus }); }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.fail("CREATE_EXECUTION_FAILED", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
    return result(true, "EXECUTED", "CREATE", "CREATE_COMMITTED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, navigationRequested: trace.navigationRequested, navigationStatus: "COMPLETED" });
  }
  private async executeLegacyDelivery(plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>, changedEntries: [string, unknown][], initialSurface: ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>): Promise<CustomerCreateConversationResult> {
    if (!initialSurface && !this.deps.navigate()) return this.navigationFail("LEGACY_NAVIGATION_FAILED");
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) return this.navigationFail("SURFACE_NOT_ACTIVE");
    for (const [field, value] of changedEntries) {
      const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "set_field", field: field as keyof CustomerCreatePlanFields, value: value! });
      if (outcome.status !== "EXECUTED") return this.legacyFail("CREATE_DRAFT_DELIVERY_FAILED", outcome);
    }
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !initialSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return result(true, plan.unsupportedFields.length ? "CLARIFICATION" : "EXECUTED", "CREATE", "CREATE_DRAFT_READY", { fieldNames: Object.keys(plan.fields), navigationRequested: !initialSurface, navigationStatus: "COMPLETED" }); }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return result(true, "CLARIFICATION", "CREATE", "CREATE_DISPLAY_NAME_REQUIRED", { fieldNames: ["displayName"], navigationRequested: !initialSurface, navigationStatus: "COMPLETED" }); }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.legacyFail("CREATE_EXECUTION_FAILED", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
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
  return { handled, status, operation, outcomeCode, fieldNames: [], hasEntityReference: false, probableClauseCount: 0, mutationPerformed: false, navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false, ...extra };
}
function activePendingContext(lifecycle: string, fields: CustomerCreatePlanFields, missingFields: Array<"displayName">): CustomerCreatePendingContext { return ["OPENING", "COLLECTING", "READY"].includes(lifecycle) ? { lifecycle: lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields } : null; }
function navigationFailureCode(status: ExecutiveNavigationCompletion["status"]): string | null { if (status === "EXPIRED") return "NAVIGATION_EXPIRED"; if (status === "FAILED" || status === "SUPERSEDED") return "NAVIGATION_FAILED"; return null; }
function safeCoordinatorFailureCode(cause: unknown): string { if (cause && typeof cause === "object" && "code" in cause) { const code = Reflect.get(cause, "code"); if (typeof code === "string" && /^[A-Z0-9_-]{1,64}$/u.test(code)) return code; } return "UNKNOWN_NAVIGATION_FAILURE"; }
async function productionPlanner(utterance: string, pendingContext: CustomerCreatePendingContext, correlationId?: string): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingContext }, correlationId); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); if (plan.kind !== "CREATE_PLAN" || !isRecord(response.data.capture)) return plan; const capture = response.data.capture; if (!isRecord(capture.result) || !Array.isArray(capture.result.draftOperations)) throw new Error("INVALID_CAPTURE_RESULT"); if (capture.result.userInteraction === "CONFIRMATION" || capture.result.userInteraction === "APPROVAL" || capture.result.userInteraction === "CLARIFICATION") return { kind: "CLARIFICATION_REQUIRED", reason: typeof capture.deltaConfirmation === "string" ? capture.deltaConfirmation : "Değişen alanlar onay bekliyor." }; const fields: CustomerCreatePlanFields = {}; for (const operation of capture.result.draftOperations) { if (!isRecord(operation) || typeof operation.fieldId !== "string") throw new Error("INVALID_CAPTURE_OPERATION"); const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === operation.fieldId); if (field && (operation.kind === "SET" || operation.kind === "CLEAR")) fields[field.key as keyof CustomerCreatePlanFields] = (operation.kind === "CLEAR" ? "" : operation.value) as never; } return { ...plan, fields }; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }), deliver: dispatchCustomerNavigationCommand });
