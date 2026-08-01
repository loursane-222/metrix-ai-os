"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DOMAIN_SURFACE_ADAPTERS, livingWorkspaceRuntime, type WorkspaceDirective, type WorkspaceSurfaceDescriptor } from "@/lib/living-workspace";
import { universalInputRegistry } from "@/lib/input-authority";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { resolveBusinessSurface, resolveBusinessSurfaceAuthorityKey } from "./BusinessSurfaceResolver";

type LoadState = { status: "loading" | "ready" | "error"; data?: unknown; error?: string };
export function LivingWorkspaceHost({ conversation }: { conversation?: React.ReactNode }) {
  const directive = useSyncExternalStore(livingWorkspaceRuntime.subscribe, livingWorkspaceRuntime.getSnapshot, () => null);
  const [mobileFocus, setMobileFocus] = useState<"conversation" | "surface">("conversation");
  useEffect(() => { if (directive) setMobileFocus("surface"); }, [directive]);
  return <div className={`relative grid h-full min-h-0 ${workspaceLayoutClass(directive?.presentationMode ?? "inline", Boolean(conversation))}`}>
    {conversation ? <section className={`${mobileFocus === "surface" ? "hidden lg:block" : "block"} min-h-0 overflow-hidden border-r border-white/[.06]`}>{conversation}</section> : null}
    <section aria-label="Çalışma Alanı" className={`${conversation && mobileFocus === "conversation" ? "hidden lg:block" : "block"} absolute inset-0 z-30 min-h-0 overflow-y-auto overscroll-contain bg-[#071018] px-3 pb-[calc(88px+env(safe-area-inset-bottom))] pt-3 lg:static lg:z-auto lg:h-full lg:bg-transparent lg:p-5`} data-executive-target="living-workspace">
      {conversation && directive ? <button aria-label="Çalışma alanını kapat" className="sticky top-0 z-10 mb-3 ml-auto grid h-10 w-10 place-items-center rounded-full border border-white/[.12] bg-[#0b161f]/95 text-[#c9d1d6] shadow-xl lg:hidden" onClick={() => setMobileFocus("conversation")} type="button"><ExecutiveIcon name="close" className="h-4 w-4"/></button> : null}
      {directive ? <DirectiveSurface directive={directive}/> : <Empty title="Çalışma yüzeyi hazır" description="METRIX’e şirketinizi, müşterilerinizi veya ürünlerinizi sorun. İlgili canonical yüzey burada açılır."/>}
    </section>
    {conversation && directive && mobileFocus === "conversation" ? <button className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-3 z-40 rounded-full border border-[#35dce3]/25 bg-[#0b161f]/96 px-4 py-3 text-xs font-semibold text-[#35dce3] shadow-xl lg:hidden" onClick={() => setMobileFocus("surface")} type="button">Çalışma Alanını Aç</button> : null}
  </div>;
}
function DirectiveSurface({ directive }: { directive: WorkspaceDirective }) {
  useEffect(() => {
    const authorityKey = resolveBusinessSurfaceAuthorityKey(directive) ?? `workspace.${directive.domain}.page`;
    const registration = universalInputRegistry.register({ descriptor: { executiveTargetId: "living-workspace", authorityKey, targetKind: "surface", module: "living-workspace", label: directive.title, surfaceType: "workspace", mutable: false, readable: true, visibility: "visible", active: true, mounted: true }, adapter: {} });
    return () => { universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); };
  }, [directive]);
  const businessSurface = resolveBusinessSurface(directive);
  return businessSurface ?? <GenericDirectiveSurface directive={directive}/>;
}
function GenericDirectiveSurface({ directive }: { directive: WorkspaceDirective }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const surface = directive.surfaces.find((item) => item.surfaceId === directive.primarySurfaceId)!;
  const refresh = () => { void load(directive, new AbortController().signal).then((data) => setState({ status: "ready", data })).catch(() => undefined); };
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void load(directive, controller.signal).then((data) => setState({ status: "ready", data })).catch((cause) => { if (!controller.signal.aborted) setState({ status: "error", error: cause instanceof Error ? cause.message : "Yüzey yüklenemedi." }); });
    return () => controller.abort();
  }, [directive]);
  return <div className="mx-auto max-w-5xl">
    <div className="mb-4 flex items-start gap-3"><button aria-label="Önceki çalışma alanı" className="grid h-9 w-9 place-items-center rounded-xl border border-white/[.08] bg-white/[.04]" onClick={() => livingWorkspaceRuntime.back()}><ExecutiveIcon name="back" className="h-4 w-4"/></button><div className="min-w-0 flex-1"><h1 className="text-lg font-bold">{directive.title}</h1><p className="mt-1 text-xs text-[#788691]">{directive.subtitle ?? "Canonical verilerden oluşturulan çalışma yüzeyi"}</p></div><button className="flex items-center gap-1 rounded-xl border border-[#35dce3]/20 bg-[#35dce3]/10 px-3 py-2 text-xs text-[#35dce3]" onClick={() => void import("@/lib/conversation-extensions/conversation-navigation-runtime").then(({ dispatchConversationNavigation }) => dispatchConversationNavigation({ correlationId: directive.correlationId, source: directive.source === "system" ? "written" : directive.source, route: directive.fullPageRoute, expectedSurfaceAuthorityKey: `workspace.${directive.domain}.page` }))}>Tümünü aç <ExecutiveIcon name="external" className="h-3.5 w-3.5"/></button></div>
    {state.status === "loading"
      ? <Empty title="Canonical veriler hazırlanıyor" description="Kaynak kayıtlar okunuyor."/>
      : state.status === "error"
        ? <Empty title="Veri alınamadı" description={state.error ?? "Bilinmeyen hata"}/>
        : <SurfaceRenderer surface={surface} data={state.data} onNotificationRead={refresh}/>}
  </div>;
}
function workspaceLayoutClass(presentationMode: WorkspaceDirective["presentationMode"], hasConversation: boolean): string {
  if (!hasConversation) return "grid-cols-1";
  const desktopLayouts: Record<WorkspaceDirective["presentationMode"], string> = {
    inline: "lg:grid-cols-[minmax(320px,0.85fr)_minmax(440px,1.15fr)]",
    split: "lg:grid-cols-[minmax(320px,0.85fr)_minmax(440px,1.15fr)]",
    focus: "lg:grid-cols-[minmax(300px,0.7fr)_minmax(480px,1.3fr)]",
  };
  return desktopLayouts[presentationMode];
}
async function load(directive: WorkspaceDirective, signal: AbortSignal) {
  const path = DOMAIN_SURFACE_ADAPTERS[directive.domain].endpoint;
  const response = await fetch(path, { credentials: "include", signal }); const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Canonical veri okunamadı.");
  return payload.data;
}
function SurfaceRenderer({ surface, data, onNotificationRead }: { surface: WorkspaceSurfaceDescriptor; data: unknown; onNotificationRead?: () => void }) {
  if (surface.type === "management-summary") return <ManagementSummarySurface data={data}/>;
  const record = data as { customers?: Array<Record<string, unknown>>; products?: Array<Record<string, unknown>>; notifications?: Array<Record<string, unknown>> };
  if (surface.domain === "notification") return <NotificationListSurface rows={record.notifications ?? []} onRead={onNotificationRead}/>;
  let rows = record.customers ?? record.products ?? [];
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
function ManagementSummarySurface({ data }: { data: unknown }) { const d = data as Record<string, unknown>; const indicators = (d.indicators ?? {}) as Record<string, unknown>; const model = (d.companyModel ?? d.projection ?? {}) as Record<string, unknown>; return <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{Object.entries(indicators).slice(0,4).map(([key,value]) => <Card key={key}><p className="text-[10px] uppercase tracking-wider text-[#77848e]">{label(key)}</p><p className="mt-2 text-xl font-bold">{String(value ?? "—")}</p></Card>)}</div><Card><h2 className="font-semibold">METRIX Yönetim Özeti</h2><p className="mt-3 text-sm leading-6 text-[#a9b3ba]">{Object.keys(model).length ? "Canonical Company Model projection hazır. Risk, fırsat ve veri kalitesi kaynak kayıtların doğrulanmış durumuna göre gösterilir." : "Yeterli canonical projection oluşmadı; METRIX değerlendirme uydurmadı."}</p></Card></div>; }
function EntityListSurface({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: readonly string[] }) { if (!rows.length) return <Empty title="Kayıt bulunamadı" description="Uygulanan filtrelerde canonical kayıt yok."/>; return <div className="grid gap-3">{rows.slice(0,50).map((row, index) => <Card key={String(row.id ?? index)}><div className="grid gap-3 sm:grid-cols-3">{columns.filter((key) => key !== "stock" || stock(row) !== null).map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#667580]">{label(key)}</p><p className="mt-1 break-words text-sm text-[#d5dade]">{format(key === "stock" ? stock(row) : row[key], key, row.currency)}</p></div>)}</div></Card>)}</div>; }
function NotificationListSurface({ rows, onRead }: { rows: Array<Record<string, unknown>>; onRead?: () => void }) {
  if (!rows.length) return <Empty title="Bildirim yok" description="Şu anda okunmamış veya kayıtlı bir bildiriminiz bulunmuyor."/>;
  return <div className="grid gap-3">{rows.map((row) => <Card key={String(row.id)}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#d5dade]">{String(row.title ?? "")}</p>
        {row.body ? <p className="mt-1 text-sm text-[#a9b3ba]">{String(row.body)}</p> : null}
        <p className="mt-2 text-[10px] uppercase tracking-wider text-[#667580]">{format(row.createdAt, "createdAt", undefined)}</p>
      </div>
      {row.isRead ? null : <button className="shrink-0 rounded-lg border border-[#35dce3]/20 bg-[#35dce3]/10 px-3 py-1.5 text-xs text-[#35dce3]" onClick={() => void markRead(String(row.id)).then(onRead)} type="button">Okundu işaretle</button>}
    </div>
  </Card>)}</div>;
}
async function markRead(notificationId: string): Promise<void> {
  await fetch(`/api/notifications/${notificationId}/read`, { method: "POST", credentials: "include" });
}
function EntityDetailSurface({ row, columns }: { row: Record<string, unknown>; columns: readonly string[] }) { return <Card><div className="grid gap-5 sm:grid-cols-2">{columns.map((key) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[#667580]">{label(key)}</p><p className="mt-1 text-sm">{format(row[key], key, row.currency)}</p></div>)}</div></Card>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">{children}</div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="grid min-h-64 place-items-center rounded-[24px] border border-dashed border-white/[.1] bg-white/[.025] p-8 text-center"><div><p className="font-semibold text-[#d8dde0]">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#788691]">{description}</p></div></div>; }
function stock(row: Record<string, unknown>) { const attrs = row.attributesJson; if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null; const value = (attrs as Record<string, unknown>).stockQuantity ?? (attrs as Record<string, unknown>).stock; return typeof value === "number" ? value : null; }
function applyFilter(row: Record<string, unknown>, filter: { field: string; operator: string; value: string | number | boolean }) { const raw = filter.field === "stock" ? stock(row) : row[filter.field]; if (filter.operator === "contains") return String(raw ?? "").toLocaleLowerCase("tr-TR").includes(String(filter.value).toLocaleLowerCase("tr-TR")); if (filter.operator === "gt") return Number(raw) > Number(filter.value); return raw === filter.value; }
function format(value: unknown, key: string, currency: unknown) { if (value === null || value === undefined || value === "") return "Veri yok"; if (key.endsWith("Cents")) return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value) / 100); return String(value); }
function label(key: string) { return ({ displayName:"Müşteri",status:"Durum",balanceCents:"Bakiye",currency:"Para Birimi",updatedAt:"Güncelleme",name:"Ürün/Hizmet",type:"Tür",category:"Kategori",priceCents:"Satış Fiyatı",costCents:"Maliyet",stock:"Stok",profileReadiness:"Profil Hazırlığı",activeGoals:"Aktif Hedefler",openManagementIssues:"Açık Konular",connectedDataSources:"Veri Kaynakları" } as Record<string,string>)[key] ?? key; }
