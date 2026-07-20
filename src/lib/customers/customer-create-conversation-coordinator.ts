import { isRecord } from "@/lib/api/validation";
import { resolveCustomerCreateConversationPlan } from "./customers-client";
import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { extractObviousCustomerCreatePlan, type CustomerCreatePendingContext } from "./customer-create-conversation-planner";
import { CustomerCreateConversationStateStore } from "./customer-create-conversation-state";
import { dispatchCustomerCreateCommand, getActiveCustomerCreateSurfaceDescriptor, subscribeCustomerCreateSurfaceMount } from "./customer-create-surface-command-channel";
import { dispatchCustomerNavigation } from "./customer-navigation-runtime";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { universalInputAuthorityHost, universalInputRegistry } from "@/lib/input-authority";
import { customerTargetId } from "./customer-universal-input-adapter";

export type CustomerCreateConversationResult = { handled: boolean; status: "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED"; message: string | null };
type Planner = (utterance: string, pendingContext: CustomerCreatePendingContext) => Promise<CustomerCreatePlan>;
export class CustomerCreateConversationCoordinator {
  readonly store: CustomerCreateConversationStateStore;
  private replayPromise: Promise<CustomerCreateConversationResult> | null = null;
  private replayResolve: ((result: CustomerCreateConversationResult) => void) | null = null;
  private mountWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private replaying = false;
  private unsubscribe: () => void;
  constructor(private deps: { planner: Planner; navigate: () => boolean }, store = new CustomerCreateConversationStateStore()) {
    this.store = store;
    this.unsubscribe = subscribeCustomerCreateSurfaceMount((descriptor) => {
      void this.replay(descriptor.token);
    });
  }
  dispose() { this.unsubscribe(); if (this.mountWaitTimer) clearTimeout(this.mountWaitTimer); this.mountWaitTimer = null; }
  async execute(utterance: string): Promise<CustomerCreateConversationResult> {
    const state = this.store.get();
    let plan: CustomerCreatePlan;
    const pendingContext = activePendingContext(state.lifecycle, state.fields, state.missingFields);
    try { plan = await this.deps.planner(utterance, pendingContext); } catch { plan = extractObviousCustomerCreatePlan(utterance, pendingContext); }
    this.store.patch({ lastPlannerOutcome: plan });
    if (plan.kind === "NOT_CUSTOMER_CREATE") return state.lifecycle !== "IDLE" && state.lifecycle !== "SUCCEEDED" && state.lifecycle !== "CANCELLED" ? { handled: true, status: "CLARIFICATION", message: "Müşteri taslağı açık. Devam etmek için alanları söyleyebilir veya kaydet diyebilirsin." } : { handled: false, status: "NOT_HANDLED", message: null };
    if (plan.kind === "STATUS_QUERY") return { handled: true, status: "EXECUTED", message: this.statusMessage() };
    if (plan.kind === "MISSING_FIELDS_QUERY") return { handled: true, status: "EXECUTED", message: this.missingMessage() };
    if (plan.kind === "CANCEL") { this.store.cancel(); return { handled: true, status: "EXECUTED", message: "Müşteri oluşturma işlemini iptal ettim." }; }
    if (plan.kind === "CLARIFICATION_REQUIRED") return { handled: true, status: "CLARIFICATION", message: plan.reason };
    const fields = { ...state.fields, ...plan.fields }; const missingFields = typeof fields.displayName === "string" && fields.displayName.trim() ? [] : ["displayName" as const];
    const commitAllowed = plan.explicitCommit && plan.unsupportedFields.length === 0;
    const lifecycle = missingFields.length ? "COLLECTING" : "READY";
    this.store.patch({ fields, missingFields, lifecycle, explicitCommitPending: commitAllowed, pendingReplay: true, lastError: null });
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (surface) return this.replay(surface.token);
    this.store.patch({ lifecycle: "OPENING" });
    this.replayPromise ??= new Promise((resolve) => {
      this.replayResolve = resolve;
      this.mountWaitTimer = setTimeout(() => resolve(this.fail("Yeni müşteri formu zamanında hazırlanamadı.", null)), 10_000);
    });
    if (!this.store.get().navigationIssued) { const navigated = this.deps.navigate(); if (!navigated) return this.fail("Yeni müşteri ekranı açılamadı.", null); this.store.patch({ navigationIssued: true }); }
    return this.replayPromise!;
  }
  private async replay(token: string): Promise<CustomerCreateConversationResult> {
    if (this.replaying) return { handled: true, status: "EXECUTED", message: null };
    this.replaying = true;
    try { return await this.performReplay(token); } finally { this.replaying = false; }
  }
  private async performReplay(token: string): Promise<CustomerCreateConversationResult> {
    const state = this.store.get();
    if (!state.pendingReplay) return { handled: true, status: "EXECUTED", message: this.statusMessage() };
    this.store.patch({ activeSurfaceToken: token, pendingReplay: false });
    for (const [field, value] of Object.entries(state.fields)) {
      const definition = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.key === field);
      const targetId = definition ? customerTargetId("create", "field", definition.fieldId) : null;
      if (targetId) {
        const registration = universalInputRegistry.getByTargetId(targetId);
        if (registration) {
          const result = await universalInputAuthorityHost.execute({ type: "SET", executiveTargetId: targetId, value, expectedRegistrationToken: registration.registrationToken, expectedGeneration: registration.generation });
          if (result.status !== "EXECUTED") return this.fail("Aktif yüzey alanı Universal Input Authority üzerinden uygulanamadı.", null);
          continue;
        }
      }
      const outcome = await dispatchCustomerCreateCommand(token, { type: "set_field", field: field as keyof CustomerCreatePlanFields, value: value! });
      if (outcome.status !== "EXECUTED") return this.fail(outcome.message ?? "Taslak alanı uygulanamadı.", outcome);
    }
    if (!state.explicitCommitPending) { this.store.patch({ lifecycle: state.fields.displayName ? "READY" : "COLLECTING" }); const result = { handled: true, status: state.lastPlannerOutcome?.kind === "CREATE_PLAN" && state.lastPlannerOutcome.unsupportedFields.length ? "CLARIFICATION" as const : "EXECUTED" as const, message: this.draftMessage(state.fields, state.lastPlannerOutcome?.kind === "CREATE_PLAN" ? state.lastPlannerOutcome : null) }; this.finishPendingReplay(result); return result; }
    if (!state.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return { handled: true, status: "CLARIFICATION", message: "Müşteriyi kaydetmek için firma adı gerekli." }; }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.fail(outcome.message ?? "Müşteri kaydedilemedi.", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: String(state.fields.displayName), lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
    const result = { handled: true, status: "EXECUTED" as const, message: `${state.fields.displayName} kaydedildi.` };
    this.finishPendingReplay(result); return result;
  }
  private fail(message: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: message, lastRuntimeOutcome: outcome ?? null }); const result = { handled: true, status: "FAILED" as const, message: `${this.store.get().fields.displayName ?? "Müşteri"} kaydedilemedi: ${message}` }; this.finishPendingReplay(result); return result; }
  private finishPendingReplay(result: CustomerCreateConversationResult) { if (this.mountWaitTimer) clearTimeout(this.mountWaitTimer); this.mountWaitTimer = null; const resolve = this.replayResolve; this.replayResolve = null; this.replayPromise = null; resolve?.(result); }
  private draftMessage(fields: CustomerCreatePlanFields, plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }> | null) { const applied = Object.keys(fields).map((key) => CUSTOMER_BUILT_IN_FIELDS.find((field) => field.key === key)?.label ?? key).join(", "); const notice = plan?.unsupportedFields.map((item) => item.message).join(" "); if (notice) return `${applied ? `${applied} alanlarını taslağa ekledim. ` : ""}${notice} Henüz kaydetmedim.${plan?.explicitCommit ? " Desteklenen bilgilerle kaydetmemi onaylıyor musun?" : ""}`; return fields.displayName ? `${applied} alanlarını taslağa ekledim. Henüz kaydetmedim.` : "Yeni müşteri formunu açtım. Firma adını söyleyebilirsin."; }
  private statusMessage() { const s = this.store.get(); const name = s.createdCustomerDisplayName ?? s.fields.displayName ?? "Müşteri"; if (s.lifecycle === "SUCCEEDED") return `Evet, ${name} kaydedildi.`; if (s.lifecycle === "SUBMITTING") return `${name} kaydı oluşturuluyor.`; if (s.lifecycle === "FAILED") return `${name} kaydedilemedi: ${s.lastError ?? "Bilinmeyen hata."}`; if (["COLLECTING", "READY", "OPENING"].includes(s.lifecycle)) return `Henüz kaydetmedim. Taslakta şu bilgiler var: ${describeFields(s.fields)}.`; if (s.lifecycle === "CANCELLED") return "Müşteri oluşturma işlemi iptal edildi."; return "Aktif bir müşteri oluşturma işlemi yok."; }
  private missingMessage() { return this.store.get().missingFields.length ? "Müşteriyi kaydetmek için firma adı gerekli." : "Zorunlu alanlar tamam. Henüz kaydetmedim."; }
}
function describeFields(fields: CustomerCreatePlanFields) { return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(", ") || "henüz bilgi yok"; }
function activePendingContext(lifecycle: string, fields: CustomerCreatePlanFields, missingFields: Array<"displayName">): CustomerCreatePendingContext { return ["OPENING", "COLLECTING", "READY"].includes(lifecycle) ? { lifecycle: lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields } : null; }
async function productionPlanner(utterance: string, pendingContext: CustomerCreatePendingContext): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingContext }); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); if (plan.kind !== "CREATE_PLAN" || !isRecord(response.data.capture)) return plan; const capture = response.data.capture; if (!isRecord(capture.result) || !Array.isArray(capture.result.draftOperations)) throw new Error("INVALID_CAPTURE_RESULT"); if (capture.result.userInteraction === "CONFIRMATION" || capture.result.userInteraction === "APPROVAL" || capture.result.userInteraction === "CLARIFICATION") return { kind: "CLARIFICATION_REQUIRED", reason: typeof capture.deltaConfirmation === "string" ? capture.deltaConfirmation : "Değişen alanlar onay bekliyor." }; const fields: CustomerCreatePlanFields = {}; for (const operation of capture.result.draftOperations) { if (!isRecord(operation) || typeof operation.fieldId !== "string") throw new Error("INVALID_CAPTURE_OPERATION"); const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === operation.fieldId); if (field && (operation.kind === "SET" || operation.kind === "CLEAR")) fields[field.key as keyof CustomerCreatePlanFields] = (operation.kind === "CLEAR" ? "" : operation.value) as never; } return { ...plan, fields }; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }) });
