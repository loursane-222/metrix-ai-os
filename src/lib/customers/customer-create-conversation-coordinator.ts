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

export type CustomerCreateConversationResult = { handled: boolean; status: "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED"; message: string | null };
type Planner = (utterance: string, pendingContext: CustomerCreatePendingContext) => Promise<CustomerCreatePlan>;
export class CustomerCreateConversationCoordinator {
  readonly store: CustomerCreateConversationStateStore;
  constructor(private deps: { planner: Planner; navigate: () => boolean; deliver?: (input: Parameters<typeof dispatchCustomerNavigationCommand>[0], navigate: boolean) => Promise<ExecutiveNavigationCompletion> }, store = new CustomerCreateConversationStateStore()) {
    this.store = store;
  }
  dispose() {}
  async execute(utterance: string, source: ConversationExtensionSource = "written"): Promise<CustomerCreateConversationResult> {
    const state = this.store.get();
    let plan: CustomerCreatePlan;
    const pendingContext = activePendingContext(state.lifecycle, state.fields, state.missingFields);
    try { plan = await this.deps.planner(utterance, pendingContext); } catch { plan = extractObviousCustomerCreatePlan(utterance, pendingContext); }
    this.store.patch({ lastPlannerOutcome: plan });
    if (plan.kind === "NOT_CUSTOMER_CREATE") return state.lifecycle !== "IDLE" && state.lifecycle !== "SUCCEEDED" && state.lifecycle !== "CANCELLED" ? { handled: true, status: "CLARIFICATION", message: "Müşteri taslağı açık. Devam etmek için alanları söyleyebilir veya kaydet diyebilirsin." } : { handled: false, status: "NOT_HANDLED", message: null };
    if (plan.kind === "STATUS_QUERY") return { handled: true, status: "EXECUTED", message: this.statusMessage() };
    if (plan.kind === "MISSING_FIELDS_QUERY") { this.store.patch({ guidanceShown: true, lastGuidanceReason: "HELP_REQUESTED", guidanceTurnCount: state.guidanceTurnCount + 1 }); return { handled: true, status: "EXECUTED", message: this.guidanceMessage() }; }
    if (plan.kind === "CANCEL") { this.store.cancel(); return { handled: true, status: "EXECUTED", message: "Müşteri oluşturma işlemini iptal ettim." }; }
    if (plan.kind === "CLARIFICATION_REQUIRED") return { handled: true, status: "CLARIFICATION", message: plan.reason };
    const fields = { ...state.fields, ...plan.fields }; const missingFields = typeof fields.displayName === "string" && fields.displayName.trim() ? [] : ["displayName" as const];
    const commitAllowed = plan.explicitCommit && plan.unsupportedFields.length === 0 && missingFields.length === 0;
    const lifecycle = missingFields.length ? "COLLECTING" : "READY";
    this.store.patch({ fields, missingFields, lifecycle, explicitCommitPending: commitAllowed, pendingReplay: true, lastError: null });
    const activeSurface = getActiveCustomerCreateSurfaceDescriptor();
    this.store.patch({ lifecycle: activeSurface ? lifecycle : "OPENING" });
    const changedEntries = Object.entries(plan.fields);
    const deliveryInput = {
      correlationId: crypto.randomUUID(), source,
      expectedSurfaceAuthorityKey: "customers.customer.create",
      expectedExecutiveTargetId: customerTargetId("create", "surface", "form"),
      batch: changedEntries.map(([field, value]) => ({ type: "SET" as const, executiveTargetId: customerTargetId("create", "field", `customer.${field}`), value })),
      finalFocusTargetId: changedEntries[0] ? customerTargetId("create", "field", `customer.${changedEntries[0][0]}`) : undefined,
    };
    if (!this.deps.deliver) return this.executeLegacyDelivery(plan, changedEntries, activeSurface);
    const navigation = await this.deps.deliver(deliveryInput, !activeSurface);
    if (navigation.status !== "COMPLETED") return this.fail(navigation.message ?? "Yeni müşteri ekranı hazırlanamadı.", null);
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) return this.fail("Yeni müşteri yüzeyi artık etkin değil.", null);
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
    if (!initialSurface && !this.deps.navigate()) return this.legacyFail("Yeni müşteri ekranı açılamadı.", null);
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (!surface) return this.legacyFail("Yeni müşteri formu zamanında hazırlanamadı.", null);
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
  private draftMessage(fields: CustomerCreatePlanFields, plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }> | null) { const applied = Object.keys(fields).map((key) => CUSTOMER_BUILT_IN_FIELDS.find((field) => field.key === key)?.label ?? key); const notice = plan?.unsupportedFields.map((item) => item.message).join(" "); if (notice) return `${applied.length ? `${formatLabels(applied)} eklendi. ` : ""}${notice}`; return applied.length ? `${formatLabels(applied)} eklendi.` : "Yeni müşteri kaydını açtım."; }
  private responseForDraft(fields: CustomerCreatePlanFields, plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>) { const state = this.store.get(); if (!state.fields.displayName && !state.guidanceShown) { this.store.patch({ guidanceShown: true, lastGuidanceReason: "WORKFLOW_OPENED", guidanceTurnCount: state.guidanceTurnCount + 1 }); return this.guidanceMessage(); } return this.draftMessage(fields, plan); }
  private guidanceMessage() { return "Yeni müşteri kaydını açtım. Firma adını söylemen yeterli. Telefon, yetkili ve e-postayı da aynı mesajda verebilirsin. Örneğin: Atlas Yapı, yetkilisi Ahmet Yılmaz."; }
  private statusMessage() { const s = this.store.get(); const name = s.createdCustomerDisplayName ?? s.fields.displayName ?? "Müşteri"; if (s.lifecycle === "SUCCEEDED") return `Evet, ${name} kaydedildi.`; if (s.lifecycle === "SUBMITTING") return `${name} kaydı oluşturuluyor.`; if (s.lifecycle === "FAILED") return `${name} kaydedilemedi: ${s.lastError ?? "Bilinmeyen hata."}`; if (["COLLECTING", "READY", "OPENING"].includes(s.lifecycle)) return `Henüz kaydetmedim. Taslakta şu bilgiler var: ${describeFields(s.fields)}.`; if (s.lifecycle === "CANCELLED") return "Müşteri oluşturma işlemi iptal edildi."; return "Aktif bir müşteri oluşturma işlemi yok."; }
  private missingMessage() { return this.store.get().missingFields.length ? "Müşteriyi kaydetmek için firma adı gerekli." : "Zorunlu alanlar tamam. Henüz kaydetmedim."; }
}
function formatLabels(labels: string[]) { if (labels.length < 2) return labels[0] ?? ""; return `${labels.slice(0, -1).join(", ")} ve ${labels.at(-1)}`; }
function describeFields(fields: CustomerCreatePlanFields) { return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(", ") || "henüz bilgi yok"; }
function activePendingContext(lifecycle: string, fields: CustomerCreatePlanFields, missingFields: Array<"displayName">): CustomerCreatePendingContext { return ["OPENING", "COLLECTING", "READY"].includes(lifecycle) ? { lifecycle: lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields } : null; }
async function productionPlanner(utterance: string, pendingContext: CustomerCreatePendingContext): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingContext }); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); if (plan.kind !== "CREATE_PLAN" || !isRecord(response.data.capture)) return plan; const capture = response.data.capture; if (!isRecord(capture.result) || !Array.isArray(capture.result.draftOperations)) throw new Error("INVALID_CAPTURE_RESULT"); if (capture.result.userInteraction === "CONFIRMATION" || capture.result.userInteraction === "APPROVAL" || capture.result.userInteraction === "CLARIFICATION") return { kind: "CLARIFICATION_REQUIRED", reason: typeof capture.deltaConfirmation === "string" ? capture.deltaConfirmation : "Değişen alanlar onay bekliyor." }; const fields: CustomerCreatePlanFields = {}; for (const operation of capture.result.draftOperations) { if (!isRecord(operation) || typeof operation.fieldId !== "string") throw new Error("INVALID_CAPTURE_OPERATION"); const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === operation.fieldId); if (field && (operation.kind === "SET" || operation.kind === "CLEAR")) fields[field.key as keyof CustomerCreatePlanFields] = (operation.kind === "CLEAR" ? "" : operation.value) as never; } return { ...plan, fields }; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }), deliver: dispatchCustomerNavigationCommand });
