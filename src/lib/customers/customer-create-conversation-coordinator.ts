import { isRecord } from "@/lib/api/validation";
import { resolveCustomerCreateConversationPlan } from "./customers-client";
import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { extractObviousCustomerCreatePlan } from "./customer-create-conversation-planner";
import { CustomerCreateConversationStateStore } from "./customer-create-conversation-state";
import { dispatchCustomerCreateCommand, getActiveCustomerCreateSurfaceDescriptor, subscribeCustomerCreateSurfaceMount } from "./customer-create-surface-command-channel";
import { dispatchCustomerNavigation } from "./customer-navigation-runtime";

export type CustomerCreateConversationResult = { handled: boolean; status: "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED"; message: string | null };
type Planner = (utterance: string, pendingFields: CustomerCreatePlanFields) => Promise<CustomerCreatePlan>;
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
      const state = this.store.get();
      if (!this.replaying && state.activeSurfaceToken !== descriptor.token && ["OPENING", "COLLECTING", "READY"].includes(state.lifecycle)) this.store.patch({ pendingReplay: true });
      void this.replay(descriptor.token);
    });
  }
  dispose() { this.unsubscribe(); if (this.mountWaitTimer) clearTimeout(this.mountWaitTimer); this.mountWaitTimer = null; }
  async execute(utterance: string): Promise<CustomerCreateConversationResult> {
    const state = this.store.get();
    let plan: CustomerCreatePlan;
    try { plan = await this.deps.planner(utterance, state.fields); } catch { plan = extractObviousCustomerCreatePlan(utterance, Object.keys(state.fields).length > 0); }
    this.store.patch({ lastPlannerOutcome: plan });
    if (plan.kind === "NOT_CUSTOMER_CREATE") return state.lifecycle !== "IDLE" && state.lifecycle !== "SUCCEEDED" && state.lifecycle !== "CANCELLED" ? { handled: true, status: "CLARIFICATION", message: "Musteri taslagi acik. Devam etmek icin alanlari soyleyebilir veya kaydet diyebilirsin." } : { handled: false, status: "NOT_HANDLED", message: null };
    if (plan.kind === "STATUS_QUERY") return { handled: true, status: "EXECUTED", message: this.statusMessage() };
    if (plan.kind === "MISSING_FIELDS_QUERY") return { handled: true, status: "EXECUTED", message: this.missingMessage() };
    if (plan.kind === "CANCEL") { this.store.cancel(); return { handled: true, status: "EXECUTED", message: "Musteri olusturma islemini iptal ettim." }; }
    if (plan.kind === "CLARIFICATION_REQUIRED") return { handled: true, status: "CLARIFICATION", message: plan.reason };
    const fields = { ...state.fields, ...plan.fields }; const missingFields = fields.displayName?.trim() ? [] : ["displayName" as const];
    const lifecycle = missingFields.length ? "COLLECTING" : "READY";
    this.store.patch({ fields, missingFields, lifecycle, explicitCommitPending: plan.explicitCommit, pendingReplay: true, lastError: null });
    const surface = getActiveCustomerCreateSurfaceDescriptor();
    if (surface) return this.replay(surface.token);
    this.store.patch({ lifecycle: "OPENING" });
    if (plan.explicitCommit) this.replayPromise ??= new Promise((resolve) => {
      this.replayResolve = resolve;
      this.mountWaitTimer = setTimeout(() => resolve(this.fail("Yeni musteri formu zamaninda hazirlanamadi.", null)), 10_000);
    });
    if (!this.store.get().navigationIssued) { const navigated = this.deps.navigate(); if (!navigated) { this.store.patch({ lifecycle: "FAILED", lastError: "Yeni musteri ekrani acilamadi." }); return { handled: true, status: "FAILED", message: "Yeni musteri ekrani acilamadi." }; } this.store.patch({ navigationIssued: true }); }
    if (!plan.explicitCommit) return { handled: true, status: "EXECUTED", message: fields.displayName ? `${fields.displayName} taslagini hazirladim. Henuz kaydetmedim.` : "Yeni musteri formunu actim. Firma adini soyleyebilirsin." };
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
      const outcome = await dispatchCustomerCreateCommand(token, { type: "set_field", field: field as keyof CustomerCreatePlanFields, value: value! });
      if (outcome.status !== "EXECUTED") return this.fail(outcome.message ?? "Taslak alani uygulanamadi.", outcome);
    }
    if (!state.explicitCommitPending) { this.store.patch({ lifecycle: state.fields.displayName ? "READY" : "COLLECTING" }); return { handled: true, status: "EXECUTED", message: state.fields.displayName ? `${state.fields.displayName} taslagini hazirladim. Henuz kaydetmedim.` : "Yeni musteri formunu actim. Firma adini soyleyebilirsin." }; }
    if (!state.fields.displayName) { this.store.patch({ lifecycle: "COLLECTING", missingFields: ["displayName"] }); return { handled: true, status: "CLARIFICATION", message: "Musteriyi kaydetmek icin firma adi gerekli." }; }
    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchCustomerCreateCommand(token, { type: "commit" });
    if (outcome.status !== "EXECUTED" || !outcome.navigation || outcome.navigation.kind !== "customer.detail") return this.fail(outcome.message ?? "Musteri kaydedilemedi.", outcome);
    this.store.patch({ lifecycle: "SUCCEEDED", lastRuntimeOutcome: outcome, createdCustomerId: outcome.navigation.customerId, createdCustomerDisplayName: state.fields.displayName, lastError: null });
    dispatchCustomerNavigation(outcome.navigation);
    const result = { handled: true, status: "EXECUTED" as const, message: `${state.fields.displayName} kaydedildi.` };
    this.finishPendingReplay(result); return result;
  }
  private fail(message: string, outcome: Parameters<typeof this.store.patch>[0]["lastRuntimeOutcome"]): CustomerCreateConversationResult { this.store.patch({ lifecycle: "FAILED", lastError: message, lastRuntimeOutcome: outcome ?? null }); const result = { handled: true, status: "FAILED" as const, message: `${this.store.get().fields.displayName ?? "Musteri"} kaydedilemedi: ${message}` }; this.finishPendingReplay(result); return result; }
  private finishPendingReplay(result: CustomerCreateConversationResult) { if (this.mountWaitTimer) clearTimeout(this.mountWaitTimer); this.mountWaitTimer = null; const resolve = this.replayResolve; this.replayResolve = null; this.replayPromise = null; resolve?.(result); }
  private statusMessage() { const s = this.store.get(); const name = s.createdCustomerDisplayName ?? s.fields.displayName ?? "Musteri"; if (s.lifecycle === "SUCCEEDED") return `Evet, ${name} kaydedildi.`; if (s.lifecycle === "SUBMITTING") return `${name} kaydi olusturuluyor.`; if (s.lifecycle === "FAILED") return `${name} kaydedilemedi: ${s.lastError ?? "Bilinmeyen hata."}`; if (["COLLECTING", "READY", "OPENING"].includes(s.lifecycle)) return `Henuz kaydetmedim. Taslakta su bilgiler var: ${describeFields(s.fields)}.`; if (s.lifecycle === "CANCELLED") return "Musteri olusturma islemi iptal edildi."; return "Aktif bir musteri olusturma islemi yok."; }
  private missingMessage() { return this.store.get().missingFields.length ? "Musteriyi kaydetmek icin firma adi gerekli." : "Zorunlu alanlar tamam. Henuz kaydetmedim."; }
}
function describeFields(fields: CustomerCreatePlanFields) { return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(", ") || "henuz bilgi yok"; }
async function productionPlanner(utterance: string, pendingFields: CustomerCreatePlanFields): Promise<CustomerCreatePlan> { const response = await resolveCustomerCreateConversationPlan({ utterance, pendingFields: pendingFields as Record<string, string> }); if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED"); const plan = validateCustomerCreatePlan(response.data.plan); if (!plan) throw new Error("INVALID_PLAN"); return plan; }
export const customerCreateConversationCoordinator = new CustomerCreateConversationCoordinator({ planner: productionPlanner, navigate: () => dispatchCustomerNavigation({ kind: "customer.create" }) });
