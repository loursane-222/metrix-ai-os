"use client";
import { useEffect, useMemo, useState } from "react";
import { DOMAIN_SURFACE_ADAPTERS, type WorkspaceDirective } from "@/lib/living-workspace";
import { OrderActionSurface } from "@/components/orders/OrderActionSurface";
import { DeliveryActionSurface } from "@/components/deliveries/DeliveryActionSurface";
import { InvoiceActionSurface } from "@/components/invoices/InvoiceActionSurface";
import { PaymentActionSurface } from "@/components/payments/PaymentActionSurface";
import { SupplierEditSurface } from "@/components/suppliers/SupplierEditSurface";
import { TaskActionSurface } from "@/components/tasks/TaskActionSurface";
import { ProductEditSurface } from "@/components/products/ProductEditSurface";
import { GoalEditSurface } from "@/components/goals/GoalEditSurface";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import { WorkspaceSurface, type WorkspaceField } from "./WorkspaceSurface";
import { resolveDataWeight } from "@/lib/executive-signatures/data-weight";
import { humanLabel } from "./human-label";

export { humanLabel } from "./human-label";

type Row = Record<string, unknown>;
type StockIntelligence = { healthSummary: string; openVarianceCount: number; riskSignalCount: number; opportunitySignalCount: number };
type PendingStockCount = { id: string; systemQuantityAtCount: string; countedQuantity: string; varianceQuantity: string; stock?: { productService?: { name?: string }; warehouse?: { name?: string } } };

export function CanonicalDomainSurface({ directive, onReady, onFailure }: { directive: WorkspaceDirective; onReady: () => void; onFailure: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [stockIntelligence, setStockIntelligence] = useState<StockIntelligence | null>(null);
  const [pendingStockCounts, setPendingStockCounts] = useState<PendingStockCount[]>([]);
  const adapter = DOMAIN_SURFACE_ADAPTERS[directive.domain];
  useEffect(() => { const controller = new AbortController(); const prepared = silentPreparationRuntime.consume(directive.domain); const request = prepared ? Promise.resolve(prepared) : fetch(adapter.endpoint, { credentials: "include", signal: controller.signal }).then((r) => r.json()); request.then((payload) => { if (!(payload as { ok?: boolean }).ok) throw new Error("canonical surface failed"); const data = (payload as { data: Record<string, unknown> }).data; const value = data[adapter.responseKey]; const loaded=Array.isArray(value)?value as Row[]:[];setRows(directive.entityId?loaded.filter((row)=>row.id===directive.entityId):loaded); onReady(); }).catch(() => { if (!controller.signal.aborted) onFailure(); }); return () => controller.abort(); }, [adapter, directive, onFailure, onReady]);
  useEffect(() => setSelected(null), [directive.directiveId]);
  useEffect(() => {
    if (directive.domain !== "stock") return;
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/stock/intelligence/executive", { credentials: "include", signal: controller.signal }).then((response) => response.json()),
      fetch("/api/stock/counts", { credentials: "include", signal: controller.signal }).then((response) => response.json()),
    ]).then(([intelligencePayload, countsPayload]: [{ ok?: boolean; data?: StockIntelligence }, { ok?: boolean; data?: { records?: PendingStockCount[] } }]) => {
      if (intelligencePayload.ok && intelligencePayload.data) setStockIntelligence(intelligencePayload.data);
      if (countsPayload.ok && countsPayload.data?.records) setPendingStockCounts(countsPayload.data.records);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [directive.domain, directive.directiveId]);
  const surface = directive.surfaces.find((item) => item.surfaceId === directive.primarySurfaceId);
  const columns = surface?.columns ?? adapter.allowedListColumns;
  const displayRows = rows === null || !directive.entityId ? rows : rows.filter((row) => row.id === directive.entityId);
  const visibleColumns = displayRows === null ? columns : columns.filter((key) => displayRows.some((row) => Object.hasOwn(row, key)));
  const listColumns = visibleColumns.filter((key) => key !== "currency").slice(0, 4);
  const kpis = useMemo(() => displayRows === null ? [] : adapter.summaryMetrics
    .filter((metric) => derivedMetric(metric) || displayRows.some((row) => Object.hasOwn(row, metric)))
    .slice(0, 4)
    .map((metric) => metricValue(metric, displayRows)), [adapter.summaryMetrics, displayRows]);
  function openRow(row: Row) {
    setSelected(row);
  }

  if (rows === null) return <div className="mx-auto max-w-5xl"><WorkspaceSurface title={directive.title} subtitle="Bilinen bilgiler hazırlanıyor…" identity={directive.entityId ? humanIdentity(directive.entityType, directive.entityId) : undefined}><div className="workspace-loading">{directive.title}</div></WorkspaceSurface></div>;

  if (selected && directive.domain === "order") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><OrderActionSurface orderId={String(selected.id)} /></div>;
  if (selected && directive.domain === "delivery") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><DeliveryActionSurface deliveryId={String(selected.id)} /></div>;
  if (selected && directive.domain === "invoice") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><InvoiceActionSurface invoiceId={String(selected.id)} /></div>;
  if (selected && directive.domain === "payment") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><PaymentActionSurface paymentId={String(selected.id)} /></div>;
  if (selected && directive.domain === "supplier") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><SupplierEditSurface supplierId={String(selected.id)} /></div>;
  if (selected && directive.domain === "task") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><TaskActionSurface taskId={String(selected.id)} /></div>;
  if (selected && directive.domain === "product") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><ProductEditSurface productId={String(selected.id)} /></div>;
  if (selected && directive.domain === "goal") return <div><button className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={() => setSelected(null)} type="button">← Listeye dön</button><GoalEditSurface goalId={String(selected.id)} /></div>;
  if (selected) return <div className="mx-auto max-w-5xl" data-canonical-domain={directive.domain} data-canonical-view="detail" data-testid={directive.domain === "customer" ? "customer-workspace-card" : undefined}><WorkspaceSurface title={primaryValue(selected, listColumns)} subtitle="Kayıt detayı" identity={String(selected.id ?? "").slice(0, 8)} actions={<button className="workspace-detail-back" onClick={() => setSelected(null)} type="button">← Listeye dön</button>} fields={visibleColumns.map((column) => ({ label: humanLabel(column), value: humanValue(selected[column], column, selected.currency) }))}/></div>;

  return <div className="mx-auto max-w-5xl" data-canonical-domain={directive.domain} data-canonical-view="list" data-testid={directive.domain === "customer" ? "customer-workspace-card" : undefined}><WorkspaceSurface title={humanTitle(directive.title)} subtitle={directive.subtitle} identity={directive.entityId ? humanIdentity(directive.entityType, directive.entityId) : undefined} kpis={kpis}>{stockIntelligence ? <section className="mb-4 rounded-2xl border border-white/[.08] bg-white/[.025] p-4" data-testid="stock-intelligence-summary"><p className="text-xs uppercase tracking-[.14em] text-[#C9BFA8]">Stok sağlığı ve yönetsel sinyaller</p><p className="mt-2 text-sm text-[#EDE7D9]">{stockIntelligence.healthSummary}</p><div className="mt-3 grid grid-cols-3 gap-3 text-xs"><span>Risk <strong>{stockIntelligence.riskSignalCount}</strong></span><span>Fırsat <strong>{stockIntelligence.opportunitySignalCount}</strong></span><span>Açık sayım farkı <strong>{stockIntelligence.openVarianceCount}</strong></span></div></section> : null}{pendingStockCounts.length ? <section className="mb-4 rounded-2xl border border-amber-200/15 bg-amber-200/[.035] p-4" data-testid="stock-variance-investigation"><p className="text-xs uppercase tracking-[.14em] text-amber-100/70">Sayım farkı · inceleme bekliyor</p>{pendingStockCounts.map((record) => <div className="mt-3 flex items-center justify-between gap-4 text-sm" key={record.id}><span><strong>{record.stock?.productService?.name ?? "Stok kaydı"}</strong> · {record.stock?.warehouse?.name ?? "Depo"} · sistem {record.systemQuantityAtCount}, sayım {record.countedQuantity}, fark {record.varianceQuantity}</span><span className="flex gap-2"><button className="rounded-lg border border-white/10 px-3 py-1" onClick={() => void resolvePendingStockCount(record.id, "DISMISS", setPendingStockCounts, setStockIntelligence)} type="button">Reddet</button><button className="rounded-lg bg-[#C9BFA8] px-3 py-1 text-[#15130f]" onClick={() => void resolvePendingStockCount(record.id, "CONFIRM", setPendingStockCounts, setStockIntelligence)} type="button">Onayla ve düzelt</button></span></div>)}</section> : null}<div className="workspace-record-list" role="list">{rows.length ? rows.slice(0, 50).map((row, index) => <div className="workspace-record-item" key={String(row.id ?? index)} role="listitem">{directive.domain === "payment" ? <PaymentCollectionRow row={row} columns={listColumns} onOpen={() => openRow(row)} /> : <button aria-label={`${primaryValue(row, listColumns)} detayını aç`} className="workspace-record-row" onClick={() => openRow(row)} type="button">{listColumns.map((column, columnIndex) => <span className={columnIndex === 0 ? "workspace-record-primary" : "workspace-record-cell"} key={column}><small>{humanLabel(column)}</small><strong>{humanValue(row[column], column, row.currency)}</strong></span>)}<span aria-hidden="true" className="workspace-record-chevron">›</span></button>}</div>) : <p className="workspace-empty">Bu görünümde kayıt bulunmuyor.</p>}</div></WorkspaceSurface></div>;
}

async function resolvePendingStockCount(id: string, resolution: "CONFIRM" | "DISMISS", setCounts: (value: PendingStockCount[]) => void, setIntelligence: (value: StockIntelligence | null) => void) {
  const response = await fetch(`/api/stock/counts/${encodeURIComponent(id)}/resolve`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolution }) });
  const payload = await response.json() as { ok?: boolean };
  if (!payload.ok) return;
  const [countsResponse, intelligenceResponse] = await Promise.all([fetch("/api/stock/counts", { credentials: "include" }), fetch("/api/stock/intelligence/executive", { credentials: "include" })]);
  const countsPayload = await countsResponse.json() as { ok?: boolean; data?: { records?: PendingStockCount[] } };
  const intelligencePayload = await intelligenceResponse.json() as { ok?: boolean; data?: StockIntelligence };
  if (countsPayload.ok) setCounts(countsPayload.data?.records ?? []);
  if (intelligencePayload.ok && intelligencePayload.data) setIntelligence(intelligencePayload.data);
}

function PaymentCollectionRow({ row, columns, onOpen }: { row: Row; columns: readonly string[]; onOpen: () => void }) {
  const remaining = Math.max(finiteNumber(row.amount) - finiteNumber(row.paidAmount), 0);
  const [value, setValue] = useState(String(remaining));
  const threshold = useCollectionGoalThreshold();
  const state = resolveDataWeight(Number(value.replace(",", ".")), threshold);
  useEffect(() => setValue(String(remaining)), [remaining]);
  return <div className="workspace-record-item-inner"> <div className="workspace-record-row">{columns.map((column, index) => <span className={index === 0 ? "workspace-record-primary" : "workspace-record-cell"} key={column}><small>{humanLabel(column)}</small><strong>{humanValue(row[column], column, row.currency)}</strong></span>)}</div><div className="mt-3 flex items-center justify-end gap-2"><button className="rounded-xl border border-white/10 px-3 py-2 text-xs text-[#C9BFA8]" onClick={onOpen} type="button">Tahsilat detayını aç</button><div className={`rounded-xl ${state === "inactive" ? "" : "bg-[#C9BFA8]/[.045] shadow-[0_0_16px_rgba(201,191,168,.14)]"}`} data-executive-signature={state === "inactive" ? undefined : "verinin.agirligi"} data-weight-state={state}><input aria-label="Tahsil edilen tutar" className="w-28 rounded-xl border border-white/[.08] bg-white/[.03] px-2 py-2 text-xs text-[#EDE7D9]" inputMode="decimal" onChange={(event) => setValue(event.target.value)} type="text" value={value}/>{state !== "inactive" ? <p className="mt-1 max-w-40 text-[10px] leading-4 text-[#C9BFA8]" role="status">{state === "exceeded" ? "METRIX: Tahsilat hedefi aşılıyor; devam edebilirsiniz." : "METRIX: Gerçek tahsilat hedefine yaklaşıldı."}</p> : null}</div></div></div>;
}

let collectionGoalRequest: Promise<number | null> | null = null;
function useCollectionGoalThreshold() {
  const [threshold, setThreshold] = useState<number | null>(null);
  useEffect(() => { collectionGoalRequest ??= fetch("/api/goals?status=ACTIVE", { credentials: "include" }).then((response) => response.json()).then((payload) => { const goals = payload?.ok && Array.isArray(payload.data?.goals) ? payload.data.goals as Array<{ targetCollectionCents?: string | null }> : []; const cents = goals.map((goal) => Number(goal.targetCollectionCents)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)[0]; return cents ? cents / 100 : null; }).catch(() => null); void collectionGoalRequest.then(setThreshold); }, []);
  return threshold;
}

function metricValue(metric: string, rows: Row[]): WorkspaceField {
  if (metric === "count") return { label: "Toplam kayıt", value: humanValue(rows.length, metric) };
  if (metric === "activeCount") return { label: "Aktif", value: humanValue(rows.filter((row) => String(row.status).toUpperCase() === "ACTIVE").length, metric) };
  if (metric === "openCount") return { label: "Açık", value: humanValue(rows.filter((row) => ["OPEN", "PENDING", "IN_PROGRESS", "DRAFT", "SENT"].includes(String(row.status).toUpperCase())).length, metric) };
  if (metric === "overdueCount") return { label: "Geciken", value: humanValue(rows.filter(isOverdue).length, metric) };
  if (metric === "depletedStockCount") return { label: "Tükenen stok", value: humanValue(rows.filter((row) => row.stock !== null && row.stock !== undefined && Number(row.stock) <= 0).length, metric) };
  const total = rows.reduce((sum, row) => sum + finiteNumber(row[metric]), 0);
  return { label: humanLabel(metric), value: humanValue(total, metric, rows.find((row) => row.currency)?.currency) };
}

function derivedMetric(metric: string) { return ["count", "activeCount", "openCount", "overdueCount", "depletedStockCount"].includes(metric); }

function isOverdue(row: Row) { const status = String(row.status).toUpperCase(); if (status === "OVERDUE") return true; if (["DONE", "PAID", "CANCELLED", "COMPLETED"].includes(status) || typeof row.dueDate !== "string") return false; return new Date(row.dueDate).valueOf() < Date.now(); }
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function primaryValue(row: Row, columns: readonly string[]) { const key = columns[0] ?? "id"; return humanValue(row[key], key, row.currency); }
function humanTitle(value: string) { return value.replace(/^(payment|invoice|task|quote|product):/iu, "").replace(/\b(list|detail)\b/giu, "").trim() || "Çalışma alanı"; }
function humanIdentity(type: string, id: string) { return `${type === "Payment" ? "Tahsilat" : type} · ${id.slice(0, 8)}`; }
function humanValue(value: unknown, key: string, currency?: unknown) { if (value === null || value === undefined || value === "") return key === "dueDate" ? "Vade tanımlanmamış" : "Belirtilmemiş"; if (/(date|At)$/iu.test(key) && typeof value === "string") { const date = new Date(value); if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date); } if (key.endsWith("Cents")) return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value) / 100); if (key === "amount" || key === "totalAmount") return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value)); return typeof value === "number" ? new Intl.NumberFormat("tr-TR").format(value) : String(value); }
