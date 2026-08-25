"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DOMAIN_SURFACE_ADAPTERS, livingWorkspaceRuntime, createCalendarWorkspaceDirective, type WorkspaceDirective, type WorkspaceSurfaceDescriptor } from "@/lib/living-workspace";
import { universalInputRegistry } from "@/lib/input-authority";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { businessSurfaceOwnsReadiness, resolveBusinessSurface, resolveBusinessSurfaceAuthorityKey } from "./BusinessSurfaceResolver";
import { cancelPaymentApplyAction, confirmPaymentApplyAction, requestPaymentApplyAction } from "@/lib/payments/payments-client";
import { WorkspacePresentationProvider } from "./WorkspacePresentationContext";
import { dispatchConversationNavigation, executiveNavigationCommandRuntime } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "@/lib/conversation-extensions/business-navigation-telemetry";
import { executeInvoiceSendAction } from "@/lib/invoices/invoices-client";
import { AccountingSummarySurface } from "./AccountingSummarySurface";
import type { AccountingSummary } from "@/lib/accounting/accounting-summary";
import { FinanceSummarySurface, type FinanceSummaryPayload } from "./FinanceSummarySurface";
import { ReportSummarySurface } from "./ReportSummarySurface";
import type { ExecutiveReport } from "@/lib/executive-reporting/executive-reporting.types";
import { ExecutiveStroke, PendingWorkRail } from "@/components/executive-signatures/SignatureComponents";
import { AtmosphereAssessmentProvider, atmosphereTone, useAtmosphereAssessment } from "./AtmosphereAssessmentContext";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import { CollectionActionsPanel } from "./CollectionActionsPanel";
import { DomainWorkspaceCloseProvider } from "./DomainWorkspacePresentationContext";

type LoadState = { status: "loading" | "ready" | "error"; data?: unknown; error?: string };
export function LivingWorkspaceHost({ conversation }: { conversation?: React.ReactNode }) {
  const preparingDomain = useSyncExternalStore(silentPreparationRuntime.subscribe, silentPreparationRuntime.getSnapshot, () => null);
  const directive = useSyncExternalStore(livingWorkspaceRuntime.subscribe, livingWorkspaceRuntime.getSnapshot, () => null);
  const navigationCommand = useSyncExternalStore(executiveNavigationCommandRuntime.subscribe, executiveNavigationCommandRuntime.getSnapshot, () => null);
  const navigationCommandRef = useRef(navigationCommand);
  navigationCommandRef.current = navigationCommand;
  const [surfaceReady, setSurfaceReady] = useState<string | null>(null);
  const [surfaceFailure, setSurfaceFailure] = useState<string | null>(null);
  const surfaceOpen = useSyncExternalStore(livingWorkspaceRuntime.subscribeSurfaceOpen, livingWorkspaceRuntime.getSurfaceOpenSnapshot, () => false);
  const setSurfaceOpen = livingWorkspaceRuntime.setSurfaceOpen;
  const directiveId = directive?.directiveId ?? null;
  const ready = Boolean(directiveId && surfaceReady === directiveId);
  const surfaceVisible = Boolean(directive && ready && (surfaceOpen || !conversation));
  const expanded = Boolean(conversation && surfaceVisible);
  const markSurfaceReady = useCallback(() => {
    if (!directiveId || !directive) return;
    setSurfaceReady(directiveId);
    const activeCommand = navigationCommandRef.current;
    emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "surface_ready", correlationId: directive.correlationId, commandId: activeCommand?.correlationId === directive.correlationId ? activeCommand.commandId : undefined, generation: activeCommand?.correlationId === directive.correlationId ? activeCommand.generation : undefined, routeType: businessNavigationRouteType(directive.navigationRoute), status: "READY", failureCode: null });
  }, [directive, directiveId]);
  const markSurfaceFailure = useCallback(() => {
    if (directiveId) setSurfaceFailure(directiveId);
  }, [directiveId]);
  // Must be a cleanup, not a fresh effect body keyed on the new directiveId.
  // React flushes a re-render's effects in two full passes — every cleanup
  // for the commit first, then every new setup — and within each pass the
  // order is child-before-parent. DirectiveSurface (child) synchronously
  // calls onReady()/markSurfaceReady() for any surface that doesn't await
  // canonical data (customer-import and the other 8 Excel/CSV wizards,
  // among others) as part of ITS OWN new-setup effect for this exact
  // commit. A same-shaped reset effect here used to run as a new setup too
  // (not a cleanup) — same commit, same pass, but the parent's setups run
  // after the child's — so it landed after and clobbered the child's fresh
  // "ready" signal back to null on every single transition into one of
  // these surfaces. As a cleanup of the OLD directiveId, this now runs in
  // the earlier cleanup pass, strictly before the new commit's setups (the
  // child's onReady included), so it can only ever clear stale state from
  // the PREVIOUS directive, never the one just becoming ready. Confirmed
  // live: production went through field_batch_applied and then sat
  // unconditionally until NAVIGATION_EXPIRED at ~10000ms because `ready`
  // never became true; local dev never showed this because React's
  // Strict Mode double-invokes mount effects there, and the second pass
  // happened to land after the reset and masked the race.
  useEffect(() => {
    return () => {
      setSurfaceReady(null);
      setSurfaceFailure(null);
      setSurfaceOpen(false);
    };
  }, [directiveId, setSurfaceOpen]);
  useEffect(() => {
    if (!ready) return;
    // requestAnimationFrame is suspended indefinitely by the browser while
    // the tab is hidden/backgrounded — if that's the state when `ready`
    // flips true, this callback never runs, the surface stays permanently
    // collapsed (max-h-0/opacity-0), and the navigation command sits until
    // it hits its 10s timeout waiting for a transition that will never
    // come. setTimeout still fires in background tabs (confirmed live:
    // reproduced with documentVisibilityState "hidden" in the console),
    // so it reaches the same next-tick deferral (needed so the collapsed
    // state paints before the open class applies, for the CSS transition)
    // without the background-tab failure mode.
    const timer = setTimeout(() => setSurfaceOpen(true), 0);
    return () => clearTimeout(timer);
  }, [ready, setSurfaceOpen]);
  useEffect(() => {
    if (!directive || !navigationCommand || surfaceFailure !== directive.directiveId || navigationCommand.correlationId !== directive.correlationId) return;
    const failed = executiveNavigationCommandRuntime.failPresentation(directive.correlationId, navigationCommand.expectedSurfaceAuthorityKey);
    if (failed) emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "workspace_presentation_failed", correlationId: directive.correlationId, commandId: navigationCommand.commandId, generation: navigationCommand.generation, routeType: businessNavigationRouteType(navigationCommand.route), status: "FAILED", failureCode: "SURFACE_NOT_ACTIVE" });
  }, [directive, navigationCommand, surfaceFailure]);
  useEffect(() => {
    if (!directive || !navigationCommand || !surfaceVisible || navigationCommand.state !== "APPLYING" || navigationCommand.correlationId !== directive.correlationId) return;
    const completed = executiveNavigationCommandRuntime.completePresented(directive.correlationId, navigationCommand.expectedSurfaceAuthorityKey);
    if (completed) emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "workspace_presented", correlationId: directive.correlationId, commandId: navigationCommand.commandId, generation: navigationCommand.generation, routeType: businessNavigationRouteType(navigationCommand.route), status: "VISIBLE_READY", failureCode: null });
  }, [directive, navigationCommand, surfaceVisible]);
  return <AtmosphereAssessmentProvider>{preparingDomain ? <div aria-label="Çalışma alanı hazırlanıyor" className="pointer-events-none absolute inset-x-0 top-0 z-50 mx-auto h-px max-w-32 bg-[#C9BFA8]/35 shadow-[0_0_10px_rgba(201,191,168,.18)]" data-executive-signature="sessiz.hazirlik" role="status" /> : null}<LivingWorkspaceSurface conversation={conversation} directive={directive} navigationCommand={navigationCommand} surfaceVisible={surfaceVisible} ready={ready} expanded={expanded} surfaceOpen={surfaceOpen} setSurfaceOpen={setSurfaceOpen} markSurfaceFailure={markSurfaceFailure} markSurfaceReady={markSurfaceReady} />
  </AtmosphereAssessmentProvider>;
}

function LivingWorkspaceSurface({ conversation, directive, navigationCommand, surfaceVisible, ready, expanded, surfaceOpen, setSurfaceOpen, markSurfaceFailure, markSurfaceReady }: { conversation?: React.ReactNode; directive: WorkspaceDirective | null; navigationCommand: ReturnType<typeof executiveNavigationCommandRuntime.getSnapshot>; surfaceVisible: boolean; ready: boolean; expanded: boolean; surfaceOpen: boolean; setSurfaceOpen: (open: boolean) => void; markSurfaceFailure: () => void; markSurfaceReady: () => void }) {
  const { assessment } = useAtmosphereAssessment();
  const offerTemplate = directive?.businessSurface === "offer-edit";
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">
    {directive ? <section aria-label="Çalışma Alanı" aria-hidden={!surfaceVisible} className={`domain-workspace-stage overflow-hidden transition-[max-height,opacity,transform] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none ${surfaceVisible ? "min-h-0 flex-1 border-b border-[rgba(228,214,182,.18)] opacity-100" : "pointer-events-none max-h-0 shrink-0 opacity-0"}`} data-domain={directive.domain} data-executive-target="living-workspace" data-presentation-phase={!ready ? "loading" : surfaceOpen ? "open" : "opening"}>
      <div className={`metrix-atmosphere metrix-atmosphere-${atmosphereTone(assessment)} flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#14120F]`} data-workspace-frame="in-flow-top">
        {!offerTemplate ? <div className="workspace-global-header shrink-0 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-[20px] border border-white/[.08] bg-white/[.035] px-3 py-2.5 md:border-x-0 md:border-t-0 md:bg-transparent md:shadow-none md:backdrop-blur-none">
            <button aria-label="Sohbete dön" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[.1] bg-white/[.04] text-[#c9d1d6]" onClick={() => setSurfaceOpen(false)} type="button"><ExecutiveIcon name="back" className="h-4 w-4"/></button>
            <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold text-[#EDE7D9]">{directive.title}</h1><p className="mt-0.5 truncate text-[11px] text-[#7C7466]">{workspaceIdentity(directive)}</p></div>
            <button aria-label="Günlük iş programını aç" className="rounded-xl border border-[rgba(228,214,182,.14)] px-3 py-2 text-xs font-semibold text-[#C9BFA8]" onClick={() => livingWorkspaceRuntime.publish(createCalendarWorkspaceDirective({ source: "system", correlationId: crypto.randomUUID() }))} type="button">Takvim</button>
          </div>
        </div> : null}
        <div className={`workspace-directive-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(24px+env(safe-area-inset-bottom))] sm:px-5 ${offerTemplate ? "pt-2 sm:pt-3" : "pt-3 sm:pt-4"}`} data-offer-template-layout={offerTemplate || undefined}>
          <DomainWorkspaceCloseProvider value={() => setSurfaceOpen(false)}><DirectiveSurface commandId={navigationCommand?.correlationId === directive.correlationId ? navigationCommand.commandId : undefined} directive={directive} generation={navigationCommand?.correlationId === directive.correlationId ? navigationCommand.generation : undefined} onFailure={markSurfaceFailure} onReady={markSurfaceReady}/></DomainWorkspaceCloseProvider>
        </div>
      </div>
    </section> : null}
    {conversation ? <section className={`workspace-conversation-layer min-h-0 overflow-hidden ${offerTemplate && expanded ? "h-[116px] shrink-0" : expanded ? "h-[210px] shrink-0 sm:h-[190px]" : "flex-1"}`} data-offer-template-conversation={offerTemplate || undefined} data-workspace-expanded={expanded}>
      <WorkspacePresentationProvider value={expanded}>{conversation}</WorkspacePresentationProvider>
    </section> : null}
  </div>;
}
function DirectiveSurface({ directive, commandId, generation, onReady, onFailure }: { directive: WorkspaceDirective; commandId?: string; generation?: number; onReady: () => void; onFailure: () => void }) {
  useEffect(() => {
    const authorityKey = resolveBusinessSurfaceAuthorityKey(directive) ?? `workspace.${directive.domain}.page`;
    const registration = universalInputRegistry.register({ descriptor: { executiveTargetId: "living-workspace", authorityKey, targetKind: "surface", module: "living-workspace", label: directive.title, surfaceType: "workspace", mutable: false, readable: true, visibility: "visible", active: true, mounted: true }, adapter: {} });
    return () => { universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); };
  }, [directive]);
  useEffect(() => {
    emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "surface_mounted", correlationId: directive.correlationId, commandId, generation, routeType: businessNavigationRouteType(directive.navigationRoute), status: "MOUNTED", failureCode: null });
  }, [commandId, directive, generation]);
  const businessSurface = resolveBusinessSurface(directive, { onReady, onFailure });
  const hasBusinessSurface = businessSurface !== null;
  const waitsForCanonicalData = businessSurfaceOwnsReadiness(directive);
  useEffect(() => { if (hasBusinessSurface && !waitsForCanonicalData) onReady(); }, [hasBusinessSurface, onReady, waitsForCanonicalData]);
  const resolved = businessSurface ?? <GenericDirectiveSurface directive={directive} onFailure={onFailure} onReady={onReady}/>;
  return directive.domain === "payment" ? <div className="space-y-3"><CollectionActionsPanel key={directive.directiveId}/>{resolved}</div> : resolved;
}
function GenericDirectiveSurface({ directive, onReady, onFailure }: { directive: WorkspaceDirective; onReady: () => void; onFailure: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const surface = directive.surfaces.find((item) => item.surfaceId === directive.primarySurfaceId)!;
  const supportedFallback = surface.type === "management-summary" || surface.domain === "notification";
  const refresh = () => { void load(directive, new AbortController().signal).then((data) => setState({ status: "ready", data })).catch((cause) => { setState({ status: "error", error: cause instanceof Error ? cause.message : "Yüzey yüklenemedi." }); onFailure(); }); };
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void load(directive, controller.signal).then((data) => { setState({ status: "ready", data }); onReady(); }).catch((cause) => { if (!controller.signal.aborted) { setState({ status: "error", error: cause instanceof Error ? cause.message : "Yüzey yüklenemedi." }); onFailure(); } });
    return () => controller.abort();
  }, [directive, onFailure, onReady]);
  if (!supportedFallback) return <Empty title="Çalışma alanı desteklenmiyor" description="Bu kayıt türü için güncel canonical çalışma yüzeyi tanımlanmamış; eski jenerik kayıt görünümü kullanılmadı."/>;
  return <div className="mx-auto max-w-5xl">
    {state.status === "loading"
      ? <div className="mx-auto max-w-5xl rounded-[20px] border border-[#e4d6b6]/15 bg-[#1c1914] p-4"><p className="text-sm font-semibold text-[#ede7d9]">{directive.title}</p><p className="mt-1 text-xs text-[#7c7466]">{workspaceIdentity(directive)} · Bilinen bilgiler hazırlanıyor…</p></div>
      : state.status === "error"
        ? <Empty title="Veri alınamadı" description={state.error ?? "Bilinmeyen hata"}/>
        : <SurfaceRenderer surface={surface} data={state.data} onNotificationRead={refresh}/>}
  </div>;
}
function workspaceIdentity(directive: WorkspaceDirective): string {
  if (directive.entityId) return `${directive.entityType} · ${directive.entityId}`;
  return directive.subtitle ?? directive.focus;
}
async function load(directive: WorkspaceDirective, signal: AbortSignal) {
  const path = DOMAIN_SURFACE_ADAPTERS[directive.domain].endpoint;
  const response = await fetch(path, { credentials: "include", signal }); const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Canonical veri okunamadı.");
  return payload.data;
}
function SurfaceRenderer({ surface, data, onNotificationRead }: { surface: WorkspaceSurfaceDescriptor; data: unknown; onNotificationRead?: () => void }) {
  if (surface.domain === "finance" && surface.type === "management-summary") return <FinanceSummarySurface summary={(data as { summary: FinanceSummaryPayload }).summary}/>;
  if (surface.domain === "accounting" && surface.type === "management-summary") return <AccountingSummarySurface summary={(data as { summary: AccountingSummary }).summary}/>;
  if (surface.domain === "report" && surface.type === "management-summary") { const reportData = data as { report: ExecutiveReport; generatedAt: string }; return <ReportSummarySurface report={reportData.report} generatedAt={reportData.generatedAt}/>; }
  if (surface.type === "management-summary") return <ManagementSummarySurface data={data}/>;
  // Every WorkspaceDomain's list rows live under DOMAIN_SURFACE_ADAPTERS[domain].responseKey
  // (not always domainKey pluralized — offer's is "quotes") — reading through that single
  // canonical map instead of a hand-written per-domain key list means a new domain, or a
  // domain whose API response key doesn't match its name, can't silently render empty here.
  const record = data as Record<string, Array<Record<string, unknown>>>;
  if (surface.domain === "notification") return <NotificationListSurface rows={record.notifications ?? []} onRead={onNotificationRead}/>;
  let rows = record[DOMAIN_SURFACE_ADAPTERS[surface.domain].responseKey] ?? [];
  if (surface.domain === "payment" && surface.type !== "entity-detail") return <PaymentListSurface rows={rows} columns={surface.columns ?? []} onApplied={onNotificationRead}/>;
  if (surface.domain === "invoice" && surface.type !== "entity-detail") return <InvoiceListSurface rows={rows} columns={surface.columns ?? []} onSent={onNotificationRead}/>;
  if (surface.domain === "customer" && surface.filters?.some((item) => item.field === "balanceCents" && item.operator === "gt")) return <Empty title="Gecikmiş borç görünümü için yeterli canonical veri yok" description="Müşteri bakiyesi mevcut; fakat vade ve gecikme ayrımı bulunmadığı için METRIX tahmin üretmedi."/>;
  if (surface.domain === "product" && surface.filters?.some((item) => item.field === "stock")) {
    const capable = rows.some((row) => stock(row) !== null);
    if (!capable) return <Empty title="Stok capability’si bulunmuyor" description="INSUFFICIENT_CANONICAL_CAPABILITY — sahte stok değeri üretilmedi."/>;
  }
  rows = rows.filter((row) => (surface.filters ?? []).every((filter) => applyFilter(row, filter)));
  if (surface.type === "entity-detail") {
    if (rows.length !== 1) return <Empty title={rows.length ? "Birden fazla eşleşme bulundu" : "Eşleşen müşteri bulunamadı"} description={rows.length ? "Lütfen şirket adını netleştirin." : "Canonical müşteri kayıtlarında bu ad bulunmuyor."}/>;
    return <EntityDetailSurface row={rows[0]} columns={surface.columns ?? []}/>;
  }
  return <EntityListSurface rows={rows} columns={surface.columns ?? []}/>;
}
function InvoiceListSurface({ rows, columns, onSent }: { rows: Array<Record<string, unknown>>; columns: readonly string[]; onSent?: () => void }) {
  if (!rows.length) return <Empty title="Kayıt bulunamadı" description="Uygulanan filtrelerde canonical kayıt yok."/>;
  return <div className="grid gap-3">{rows.slice(0,50).map((row, index) => <InvoiceRow key={String(row.id ?? index)} row={row} columns={columns} onSent={onSent}/>)}</div>;
}
function InvoiceRow({ row, columns, onSent }: { row: Record<string, unknown>; columns: readonly string[]; onSent?: () => void }) {
  const id = String(row.id ?? "");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const result = await executeInvoiceSendAction(id);
    setBusy(false);
    if (result.ok) onSent?.();
  }
  return <Card>
    <div className="grid gap-3 sm:grid-cols-3">{columns.map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label(key)}</p><p className="mt-1 break-words text-sm text-[#EDE7D9]">{format(row[key], key, row.currency)}</p></div>)}</div>
    {row.status === "DRAFT" && id ? <div className="mt-3 flex justify-end"><button className="rounded-xl border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-2 text-xs font-semibold text-[#C9BFA8]" disabled={busy} onClick={() => void send()} type="button">{busy ? "İşleniyor…" : "Gönderildi olarak işaretle"}</button></div> : null}
  </Card>;
}
function ManagementSummarySurface({ data }: { data: unknown }) { const d = data as Record<string, unknown>; const indicators = (d.indicators ?? {}) as Record<string, unknown>; const model = (d.companyModel ?? d.projection ?? {}) as Record<string, unknown>; return <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{Object.entries(indicators).slice(0,4).map(([key,value]) => <Card key={key}><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label(key)}</p><p className="mt-2 text-xl font-bold">{String(value ?? "—")}</p></Card>)}</div><Card><h2 className="font-semibold">METRIX Yönetim Özeti</h2><p className="mt-3 text-sm leading-6 text-[#C9BFA8]">{Object.keys(model).length ? "Canonical Company Model projection hazır. Risk, fırsat ve veri kalitesi kaynak kayıtların doğrulanmış durumuna göre gösterilir." : "Yeterli canonical projection oluşmadı; METRIX değerlendirme uydurmadı."}</p></Card></div>; }
function EntityListSurface({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: readonly string[] }) { if (!rows.length) return <Empty title="Kayıt bulunamadı" description="Uygulanan filtrelerde canonical kayıt yok."/>; return <div className="grid gap-3">{rows.slice(0,50).map((row, index) => <Card key={String(row.id ?? index)}><div className="grid gap-3 sm:grid-cols-3">{columns.filter((key) => key !== "stock" || stock(row) !== null).map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label(key)}</p><p className="mt-1 break-words text-sm text-[#EDE7D9]">{format(key === "stock" ? stock(row) : row[key], key, row.currency)}</p></div>)}</div></Card>)}</div>; }
function NotificationListSurface({ rows, onRead }: { rows: Array<Record<string, unknown>>; onRead?: () => void }) {
  if (!rows.length) return <Empty title="Bildirim yok" description="Şu anda okunmamış veya kayıtlı bir bildiriminiz bulunmuyor."/>;
  return <div className="grid gap-3">{rows.map((row) => <Card key={String(row.id)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#EDE7D9]">{String(row.title ?? "")}</p>
        {row.body ? <p className="mt-1 text-sm text-[#C9BFA8]">{String(row.body)}</p> : null}
        <p className="mt-2 text-[10px] uppercase tracking-wider text-[#7C7466]">{format(row.createdAt, "createdAt", undefined)}</p>
        {row.entityType === "Customer" && row.entityId ? <button className="mt-3 rounded-lg border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs text-[#C9BFA8]" onClick={() => void dispatchConversationNavigation({ route: `/metrix/customers/${encodeURIComponent(String(row.entityId))}`, source: "written", correlationId: crypto.randomUUID(), expectedSurfaceAuthorityKey: "customers.detail.page" })} type="button">Müşteri kaydını aç</button> : null}
      </div>
      {row.isRead ? null : <button className="shrink-0 rounded-lg border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs text-[#C9BFA8]" onClick={() => void markRead(String(row.id)).then(onRead)} type="button">Okundu işaretle</button>}
    </div>
  </Card>)}</div>;
}
async function markRead(notificationId: string): Promise<void> {
  await fetch(`/api/notifications/${notificationId}/read`, { method: "POST", credentials: "include" });
}
/**
 * Canonical entry point for payment.apply from the Living Workspace: this
 * is the reference row action (Collections list), not a page-owned
 * feature. Any other surface (Customer, Invoice, Notification, Executive
 * suggestion) that wants to offer "mark as paid" calls the same
 * request/confirm/cancel-PaymentApplyAction client functions, which hit the
 * same payment-apply-gateway/Action Runtime path — no second authority.
 */
function PaymentListSurface({ rows, columns, onApplied }: { rows: Array<Record<string, unknown>>; columns: readonly string[]; onApplied?: () => void }) {
  if (!rows.length) return <Empty title="Kayıt bulunamadı" description="Uygulanan filtrelerde canonical kayıt yok."/>;
  return <div className="grid gap-3">{rows.slice(0,50).map((row, index) => <PaymentRow key={String(row.id ?? index)} row={row} columns={columns} onApplied={onApplied}/>)}</div>;
}
function PaymentRow({ row, columns, onApplied }: { row: Record<string, unknown>; columns: readonly string[]; onApplied?: () => void }) {
  const id = String(row.id ?? "");
  const status = String(row.status ?? "");
  const amount = Number(row.amount ?? 0);
  const paidAmount = Number(row.paidAmount ?? 0);
  const remaining = Math.max(amount - paidAmount, 0);
  const canApply = Boolean(id) && status !== "PAID" && status !== "CANCELLED" && remaining > 0;
  const [approval, setApproval] = useState<{ approvalId: string; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amountInput, setAmountInput] = useState(() => String(remaining));
  useEffect(() => { setAmountInput(String(remaining)); }, [remaining]);

  const parsedAmount = Number(amountInput.replace(",", "."));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= remaining + 0.005;

  async function requestApply() {
    if (!amountValid) return;
    setBusy(true);
    const result = await requestPaymentApplyAction(id, parsedAmount);
    setBusy(false);
    if (result.ok) setApproval({ approvalId: result.data.approval.approvalId, amount: parsedAmount });
  }
  async function cancel() {
    if (!approval) return;
    setBusy(true);
    await cancelPaymentApplyAction(id, approval.approvalId);
    setBusy(false);
    setApproval(null);
  }
  async function confirm() {
    if (!approval) return;
    setBusy(true);
    const result = await confirmPaymentApplyAction(id, approval.approvalId, approval.amount);
    setBusy(false);
    if (result.ok) { setApproval(null); onApplied?.(); }
  }

  return <Card>
    <div className="grid gap-3 sm:grid-cols-3">{columns.map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label(key)}</p><p className="mt-1 break-words text-sm text-[#EDE7D9]">{format(row[key], key, row.currency)}</p></div>)}</div>
    {canApply ? <div className="mt-3 flex items-center justify-end gap-2">
      {approval
        ? <PendingWorkRail work={{ title: "Tahsilat onayı bekliyor", nextStep: `₺${approval.amount.toLocaleString("tr-TR")} tutarı tahsil edilecek`, onPrimary: () => void confirm(), onCancel: () => void cancel(), primaryContent: <ExecutiveStroke label={busy ? "İşleniyor…" : "Tahsilatı kesinleştir"} onCommit={() => void confirm()} onCancel={() => void cancel()} /> }} />
        : <>
          <input aria-label="Tahsil edilen tutar" className="w-28 rounded-xl border border-white/[.08] bg-white/[.03] px-2 py-2 text-xs text-[#EDE7D9] outline-none focus:border-[#C9BFA8]/35" disabled={busy} inputMode="decimal" onChange={(event) => setAmountInput(event.target.value)} type="text" value={amountInput}/>
          <button className="rounded-xl border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-2 text-xs font-semibold text-[#C9BFA8] disabled:opacity-40" disabled={busy || !amountValid} onClick={() => void requestApply()} type="button">Tahsil edildi olarak işaretle</button>
        </>}
    </div> : null}
  </Card>;
}
function EntityDetailSurface({ row, columns }: { row: Record<string, unknown>; columns: readonly string[] }) { return <Card><div className="grid gap-5 sm:grid-cols-2">{columns.map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label(key)}</p><p className="mt-1 text-sm">{format(row[key], key, row.currency)}</p></div>)}</div></Card>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">{children}</div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="grid min-h-64 place-items-center rounded-[24px] border border-dashed border-white/[.1] bg-white/[.025] p-8 text-center"><div><p className="font-semibold text-[#EDE7D9]">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7C7466]">{description}</p></div></div>; }
function stock(row: Record<string, unknown>) { const attrs = row.attributesJson; if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null; const value = (attrs as Record<string, unknown>).stockQuantity ?? (attrs as Record<string, unknown>).stock; return typeof value === "number" ? value : null; }
function applyFilter(row: Record<string, unknown>, filter: { field: string; operator: string; value: string | number | boolean }) { const raw = filter.field === "stock" ? stock(row) : row[filter.field]; if (filter.operator === "contains") return String(raw ?? "").toLocaleLowerCase("tr-TR").includes(String(filter.value).toLocaleLowerCase("tr-TR")); if (filter.operator === "gt") return Number(raw) > Number(filter.value); return raw === filter.value; }
function format(value: unknown, key: string, currency: unknown) { if (value === null || value === undefined || value === "") return "Veri yok"; if (key.endsWith("Cents")) return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value) / 100); return String(value); }
function label(key: string) { return ({ displayName:"Müşteri",status:"Durum",balanceCents:"Bakiye",currency:"Para Birimi",updatedAt:"Güncelleme",name:"Ürün/Hizmet",type:"Tür",category:"Kategori",priceCents:"Satış Fiyatı",costCents:"Maliyet",stock:"Stok",profileReadiness:"Profil Hazırlığı",activeGoals:"Aktif Hedefler",openManagementIssues:"Açık Konular",connectedDataSources:"Veri Kaynakları",title:"Başlık",dueDate:"Vade",priority:"Öncelik",amount:"Tutar",invoiceNumber:"Fatura No",totalAmount:"Toplam Tutar" } as Record<string,string>)[key] ?? key; }
