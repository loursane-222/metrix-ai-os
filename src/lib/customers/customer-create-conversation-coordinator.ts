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

export type CustomerCreateConversationResult = { handled: boolean; status: "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED"; message: string | null };
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
        canonicalBypass: result.handled,
      });
      return result;
    } catch (cause) {
      emitCustomerLifecycle("CustomerConversation", {
        event: "coordinator_failed", correlationId, source, priorLifecycle,
        resultingLifecycle: this.store.get().lifecycle,
        failureCode: safeCoordinatorFailureCode(cause),
        handled: true, resultStatus: "FAILED", canonicalBypass: true,
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
    if (plan.kind === "NOT_CUSTOMER_CREATE") return { handled: false, status: "NOT_HANDLED", message: null };
    if (plan.kind === "STATUS_QUERY") return { handled: true, status: "EXECUTED", message: this.statusMessage() };
    if (plan.kind === "MISSING_FIELDS_QUERY") { this.store.patch({ guidanceShown: true, lastGuidanceReason: "HELP_REQUESTED", guidanceTurnCount: state.guidanceTurnCount + 1 }); return { handled: true, status: "EXECUTED", message: this.guidanceMessage() }; }
    if (plan.kind === "CANCEL") { this.store.cancel(); return { handled: true, status: "EXECUTED", message: "Müşteri oluşturma işlemini iptal ettim." }; }
    if (plan.kind === "CLARIFICATION_REQUIRED") return { handled: true, status: "CLARIFICATION", message: plan.reason };
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
      emitCustomerLifecycle("CustomerConversation", { event: "delivery_completed", correlationId, source, navigationStatus: trace.navigationStatus, failureCode: trace.failureCode, handled: result.handled, resultStatus: result.status, canonicalBypass: result.handled });
      return result;
    }
    const navigation = await this.deps.deliver(deliveryInput, !activeSurface);
    trace.navigationStatus = navigation.status;
    trace.failureCode = navigationFailureCode(navigation.status);
    emitCustomerLifecycle("CustomerConversation", { event: "delivery_completed", correlationId, source, navigationStatus: navigation.status, failureCode: trace.failureCode, changedTargetCount: navigation.changedExecutiveTargetIds.length });
    if (navigation.status !== "COMPLETED") return this.navigationFail(navigation.message ?? "Yeni müşteri ekranı hazırlanamadı.");
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) { trace.navigationStatus = "FAILED"; trace.failureCode = "SURFACE_NOT_ACTIVE"; return this.navigationFail("Yeni müşteri yüzeyi artık etkin değil."); }
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !activeSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return { handled: true, status: plan.unsupportedFields.length ? "CLARIFICATION" as const : "EXECUTED" as const, message: this.responseForDraft(plan.fields, plan) }; }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return { handled: true, status: "CLARIFICATION", message: "Müşteriyi kaydetmek için firma adı gerekli." }; }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.fail(outcome.message ?? "Müşteri kaydedilemedi.", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
    return { handled: true, status: "EXECUTED" as const, message: `${current.fields.displayName} kaydedildi.` };
  }
  private async executeLegacyDelivery(plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>, changedEntries: [string, unknown][], initialSurface: ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>): Promise<CustomerCreateConversationResult> {
    if (!initialSurface && !this.deps.navigate()) return this.navigationFail("Yeni müşteri ekranı açılamadı.");
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) return this.navigationFail("Yeni müşteri formu zamanında hazırlanamadı.");
    for (const [field, value] of changedEntries) {
      const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "set_field", field: field as keyof CustomerCreatePlanFields, value: value! });
      if (outcome.status !== "EXECUTED") return this.legacyFail(outcome.message ?? "Taslak alanı uygulanamadı.", outcome);
    }
    this.store.patch({ activeSurfaceToken: surface.token, pendingReplay: false, navigationIssued: !initialSurface });
    const current = this.store.get();
    if (!current.explicitCommitPending) { this.store.patch({ lifecycle: current.fields.displayName ? "READY" : "COLLECTING" }); return { handled: true, status: plan.unsupportedFields.length ? "CLARIFICATION" : "EXECUTED", message: `${this.responseForDraft(plan.fields, plan)} Henüz kaydetmedim.` }; }
    if (!current.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return { handled: true, status: "CLARIFICATION", message: "Müşteriyi kaydetmek için firma adı gerekli." }; }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(surface.token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.legacyFail(outcome.message ?? "Müşteri kaydedilemedi.", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(current.fields.displayName), lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
    return { handled: true, status: "EXECUTED", message: `${current.fields.displayName} kaydedildi.` };
  }
  private legacyFail(message: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: message, lastRuntimeOutcome: outcome ?? null }); return { handled: true, status: "FAILED", message: `${this.store.get().fields.displayName ?? "Müşteri"} kaydedilemedi: ${message}` }; }
  private fail(message: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: message, lastRuntimeOutcome: outcome ?? null }); return { handled: true, status: "FAILED" as const, message }; }
  private navigationFail(error: string): CustomerCreateConversationResult {
    const state = this.store.get();
    this.store.patch({
      lifecycle: state.fields.displayName ? "READY" : "COLLECTING",
      activeSurfaceToken: null,
      lastError: error,
      lastRuntimeOutcome: null,
      navigationIssued: false,
      pendingReplay: true,
    });
    return {
      handled: true,
      status: "FAILED",
      message: "Yeni müşteri ekranını şu anda açamadım. Buradan devam edelim: önce firma adını söyle, bilgileri taslağa alayım.",
    };
  }
  private draftMessage(fields: CustomerCreatePlanFields, plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }> | null) { const applied = Object.keys(fields).map((key) => CUSTOMER_BUILT_IN_FIELDS.find((field) => field.key === key)?.label ?? key); const notice = plan?.unsupportedFields.map((item) => item.message).join(" "); if (notice) return `${applied.length ? `${formatLabels(applied)} eklendi. ` : ""}${notice}`; return applied.length ? `${formatLabels(applied)} eklendi.` : "Yeni müşteri kaydını açtım."; }
  private responseForDraft(fields: CustomerCreatePlanFields, plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>) { const state = this.store.get(); if (!state.fields.displayName && !state.guidanceShown) { this.store.patch({ guidanceShown: true, lastGuidanceReason: "WORKFLOW_OPENED", guidanceTurnCount: state.guidanceTurnCount + 1 }); return this.guidanceMessage(); } return this.draftMessage(fields, plan); }
  private guidanceMessage() { return "Yeni müşteri kaydını açtım. Firma adını söylemen yeterli. Telefon, yetkili ve e-postayı da aynı mesajda verebilirsin. Örneğin: Atlas Yapı, yetkilisi Ahmet Yılmaz."; }
  private statusMessage() { const s = this.store.get(); const name = s.createdCustomerDisplayName ?? s.fields.displayName ?? "Müşteri"; if (s.lifecycle === "SUCCEEDED") return `Evet, ${name} kaydedildi.`; if (s.lifecycle === "SUBMITTING") return `${name} kaydı oluşturuluyor.`; if (s.lifecycle === "FAILED") return `${name} kaydedilemedi: ${s.lastError ?? "Bilinmeyen hata."}`; if (["COLLECTING", "READY", "OPENING"].includes(s.lifecycle)) return `Henüz kaydetmedim. Taslakta şu bilgiler var: ${describeFields(s.fields)}.`; if (s.lifecycle === "CANCELLED") return "Müşteri oluşturma işlemi iptal edildi."; return "Aktif bir müşteri oluşturma işlemi yok."; }
  private missingMessage() { return this.store.get().missingFields.length ? "Müşteriyi kaydetmek için firma adı gerekli." : "Zorunlu alanlar tamam. Henüz kaydetmedim."; }
}
function formatLabels(labels: string[]) { if (labels.length < 2) return labels[0] ?? ""; return `${labels.slice(0, -1).join(", ")} ve ${labels.at(-1)}`; }
function describeFields(fields: CustomerCreatePlanFields) { return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(", ") || "henüz bilgi yok"; }
function activePendingContext(lifecycle: string, fields: CustomerCreatePlanFields, missingFields: Array<"displayName">): CustomerCreatePendingContext { return ["OPENING", "COLLECTING", "READY"].includes(lifecycle) ? { lifecycle: lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields } : null; }
function navigationFailureCode(status: ExecutiveNavigationCompletion["status"]): string | null { if (status === "EXPIRED") return "NAVIGATION_EXPIRED"; if (status === "FAILED" || status === "SUPERSEDED") return "NAVIGATION_FAILED"; return null; }
function safeCoordinatorFailureCode(cause: unknown): string { if (cause && typeof cause === "object" && "code" in cause) { const code = Reflect.get(cause, "code"); if (typeof code === "string" && /^[A-Z0-9_-]{1,64}$/u.test(code)) return code; } return "UNKNOWN_NAVIGATION_FAILURE"; }
async function productionPlanner(utterance: string, pendingContext: CustomerCreatePendingContext, correlationId?: string): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingContext }, correlationId); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); if (plan.kind !== "CREATE_PLAN" || !isRecord(response.data.capture)) return plan; const capture = response.data.capture; if (!isRecord(capture.result) || !Array.isArray(capture.result.draftOperations)) throw new Error("INVALID_CAPTURE_RESULT"); if (capture.result.userInteraction === "CONFIRMATION" || capture.result.userInteraction === "APPROVAL" || capture.result.userInteraction === "CLARIFICATION") return { kind: "CLARIFICATION_REQUIRED", reason: typeof capture.deltaConfirmation === "string" ? capture.deltaConfirmation : "Değişen alanlar onay bekliyor." }; const fields: CustomerCreatePlanFields = {}; for (const operation of capture.result.draftOperations) { if (!isRecord(operation) || typeof operation.fieldId !== "string") throw new Error("INVALID_CAPTURE_OPERATION"); const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === operation.fieldId); if (field && (operation.kind === "SET" || operation.kind === "CLEAR")) fields[field.key as keyof CustomerCreatePlanFields] = (operation.kind === "CLEAR" ? "" : operation.value) as never; } return { ...plan, fields }; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }), deliver: dispatchCustomerNavigationCommand });
