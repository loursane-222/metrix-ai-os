"use client";
import { useEffect, useMemo, useState } from "react";
import { DOMAIN_SURFACE_ADAPTERS, type WorkspaceDirective } from "@/lib/living-workspace";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import { WorkspaceSurface, type WorkspaceField } from "./WorkspaceSurface";
import { resolveDataWeight } from "@/lib/executive-signatures/data-weight";

type Row = Record<string, unknown>;

export function CanonicalDomainSurface({ directive, onReady, onFailure }: { directive: WorkspaceDirective; onReady: () => void; onFailure: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const adapter = DOMAIN_SURFACE_ADAPTERS[directive.domain];
  useEffect(() => { const controller = new AbortController(); const prepared = silentPreparationRuntime.consume(directive.domain); const request = prepared ? Promise.resolve(prepared) : fetch(adapter.endpoint, { credentials: "include", signal: controller.signal }).then((r) => r.json()); request.then((payload) => { if (!(payload as { ok?: boolean }).ok) throw new Error("canonical surface failed"); const data = (payload as { data: Record<string, unknown> }).data; const value = data[adapter.responseKey]; const loaded=Array.isArray(value)?value as Row[]:[];setRows(directive.entityId?loaded.filter((row)=>row.id===directive.entityId):loaded); onReady(); }).catch(() => { if (!controller.signal.aborted) onFailure(); }); return () => controller.abort(); }, [adapter, directive, onFailure, onReady]);
  useEffect(() => setSelected(null), [directive.directiveId]);
  const surface = directive.surfaces.find((item) => item.surfaceId === directive.primarySurfaceId);
  const columns = surface?.columns ?? adapter.allowedListColumns;
  const displayRows = rows === null || !directive.entityId ? rows : rows.filter((row) => row.id === directive.entityId);
  const visibleColumns = displayRows === null ? columns : columns.filter((key) => displayRows.some((row) => Object.hasOwn(row, key)));
  const listColumns = visibleColumns.filter((key) => key !== "currency").slice(0, 4);
  const kpis = useMemo(() => displayRows === null ? [] : adapter.summaryMetrics
    .filter((metric) => derivedMetric(metric) || displayRows.some((row) => Object.hasOwn(row, metric)))
    .slice(0, 4)
    .map((metric) => metricValue(metric, displayRows)), [adapter.summaryMetrics, displayRows]);

  if (rows === null) return <div className="mx-auto max-w-5xl"><WorkspaceSurface title={directive.title} subtitle="Bilinen bilgiler hazırlanıyor…" identity={directive.entityId ? humanIdentity(directive.entityType, directive.entityId) : undefined}><div className="workspace-loading">{directive.title}</div></WorkspaceSurface></div>;

  if (selected) return <div className="mx-auto max-w-5xl" data-canonical-domain={directive.domain} data-canonical-view="detail" data-testid={directive.domain === "customer" ? "customer-workspace-card" : undefined}><WorkspaceSurface title={primaryValue(selected, listColumns)} subtitle="Kayıt detayı" identity={String(selected.id ?? "").slice(0, 8)} actions={<button className="workspace-detail-back" onClick={() => setSelected(null)} type="button">← Listeye dön</button>} fields={visibleColumns.map((column) => ({ label: humanLabel(column), value: humanValue(selected[column], column, selected.currency) }))}/></div>;

  return <div className="mx-auto max-w-5xl" data-canonical-domain={directive.domain} data-canonical-view="list" data-testid={directive.domain === "customer" ? "customer-workspace-card" : undefined}><WorkspaceSurface title={humanTitle(directive.title)} subtitle={directive.subtitle} identity={directive.entityId ? humanIdentity(directive.entityType, directive.entityId) : undefined} kpis={kpis}><div className="workspace-record-list" role="list">{rows.length ? rows.slice(0, 50).map((row, index) => <div className="workspace-record-item" key={String(row.id ?? index)} role="listitem">{directive.domain === "payment" ? <PaymentCollectionRow row={row} columns={listColumns} /> : <button aria-label={`${primaryValue(row, listColumns)} detayını aç`} className="workspace-record-row" onClick={() => setSelected(row)} type="button">{listColumns.map((column, columnIndex) => <span className={columnIndex === 0 ? "workspace-record-primary" : "workspace-record-cell"} key={column}><small>{humanLabel(column)}</small><strong>{humanValue(row[column], column, row.currency)}</strong></span>)}<span aria-hidden="true" className="workspace-record-chevron">›</span></button>}</div>) : <p className="workspace-empty">Bu görünümde kayıt bulunmuyor.</p>}</div></WorkspaceSurface></div>;
}

function PaymentCollectionRow({ row, columns }: { row: Row; columns: readonly string[] }) {
  const remaining = Math.max(finiteNumber(row.amount) - finiteNumber(row.paidAmount), 0);
  const [value, setValue] = useState(String(remaining));
  const threshold = useCollectionGoalThreshold();
  const state = resolveDataWeight(Number(value.replace(",", ".")), threshold);
  useEffect(() => setValue(String(remaining)), [remaining]);
  return <div className="workspace-record-item-inner"> <div className="workspace-record-row">{columns.map((column, index) => <span className={index === 0 ? "workspace-record-primary" : "workspace-record-cell"} key={column}><small>{humanLabel(column)}</small><strong>{humanValue(row[column], column, row.currency)}</strong></span>)}</div><div className="mt-3 flex items-center justify-end"><div className={`rounded-xl ${state === "inactive" ? "" : "bg-[#C9BFA8]/[.045] shadow-[0_0_16px_rgba(201,191,168,.14)]"}`} data-executive-signature={state === "inactive" ? undefined : "verinin.agirligi"} data-weight-state={state}><input aria-label="Tahsil edilen tutar" className="w-28 rounded-xl border border-white/[.08] bg-white/[.03] px-2 py-2 text-xs text-[#EDE7D9]" inputMode="decimal" onChange={(event) => setValue(event.target.value)} type="text" value={value}/>{state !== "inactive" ? <p className="mt-1 max-w-40 text-[10px] leading-4 text-[#C9BFA8]" role="status">{state === "exceeded" ? "METRIX: Tahsilat hedefi aşılıyor; devam edebilirsiniz." : "METRIX: Gerçek tahsilat hedefine yaklaşıldı."}</p> : null}</div></div></div>;
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
function humanLabel(key: string) { return ({ count: "Toplam kayıt", displayName: "Müşteri", customerName: "Müşteri", balanceCents: "Toplam bakiye", dueDate: "Vade", createdAt: "Oluşturulma", updatedAt: "Güncelleme", status: "Durum", amount: "Toplam tutar", totalAmount: "Toplam tutar", title: "Başlık", description: "Açıklama", invoiceNumber: "Fatura numarası", invoiceTitle: "Fatura", paymentCount: "Tahsilat sayısı", paymentReferences: "Tahsilatlar", currency: "Para birimi", priority: "Öncelik", priorityLabel: "Öncelik", priorityExplanation: "Öncelik faktörleri", fulfillmentSummary: "Karşılama özeti", reservationStatus: "Rezervasyon durumu", deliveryProgressSummary: "Teslimat ilerlemesi", revisionHistorySummary: "Revizyon geçmişi", orderNumber: "Sipariş no", deliveryNumber: "İrsaliye no", integritySummary: "Sevkiyat bütünlüğü", onTimeDeliveryRate: "Zamanında teslim oranı", firstAttemptSuccessRate: "İlk seferde başarı", damageRate: "Hasar/eksik oranı", carrier: "Taşıyıcı", stock: "Stok", name: "Ürün" } as Record<string, string>)[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()); }
function humanValue(value: unknown, key: string, currency?: unknown) { if (value === null || value === undefined || value === "") return key === "dueDate" ? "Vade tanımlanmamış" : "Belirtilmemiş"; if (/(date|At)$/iu.test(key) && typeof value === "string") { const date = new Date(value); if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date); } if (key.endsWith("Cents")) return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value) / 100); if (key === "amount" || key === "totalAmount") return new Intl.NumberFormat("tr-TR", { style: "currency", currency: String(currency ?? "TRY") }).format(Number(value)); return typeof value === "number" ? new Intl.NumberFormat("tr-TR").format(value) : String(value); }
