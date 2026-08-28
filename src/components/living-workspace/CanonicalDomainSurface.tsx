"use client";
import { useEffect, useMemo, useState } from "react";
import { DOMAIN_SURFACE_ADAPTERS, type WorkspaceDirective } from "@/lib/living-workspace";
import { OrderActionSurface } from "@/components/orders/OrderActionSurface";
import { DeliveryActionSurface } from "@/components/deliveries/DeliveryActionSurface";
import { InvoiceActionSurface } from "@/components/invoices/InvoiceActionSurface";
import { PaymentActionSurface } from "@/components/payments/PaymentActionSurface";
import { SupplierEditSurface } from "@/components/suppliers/SupplierEditSurface";
import { CustomerEditScreen } from "@/components/customers/CustomerEditScreen";
import { TaskActionSurface } from "@/components/tasks/TaskActionSurface";
import { ProductEditSurface } from "@/components/products/ProductEditSurface";
import { GoalEditSurface } from "@/components/goals/GoalEditSurface";
import { OfferEditScreen } from "@/components/offers/OfferEditScreen";
import { ProductionOrderEditSurface } from "@/components/production/ProductionOrderEditSurface";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import { WorkspaceSurface, type WorkspaceField } from "./WorkspaceSurface";
import { resolveDataWeight } from "@/lib/executive-signatures/data-weight";
import { humanLabel } from "./human-label";
import { ApprovedDomainWorkspace, type ApprovedDomainRow } from "./ApprovedDomainWorkspace";
import { useDomainWorkspaceClose } from "./DomainWorkspacePresentationContext";
import { ApprovedDetailWorkspace } from "./ApprovedDetailWorkspace";

export { humanLabel } from "./human-label";

type Row = Record<string, unknown>;
type StockIntelligence = { healthSummary: string; openVarianceCount: number; riskSignalCount: number; opportunitySignalCount: number };
type PendingStockCount = { id: string; systemQuantityAtCount: string; countedQuantity: string; varianceQuantity: string; stock?: { productService?: { name?: string }; warehouse?: { name?: string } } };

export function CanonicalDomainSurface({ directive, onReady, onFailure }: { directive: WorkspaceDirective; onReady: () => void; onFailure: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [stockIntelligence, setStockIntelligence] = useState<StockIntelligence | null>(null);
  const [pendingStockCounts, setPendingStockCounts] = useState<PendingStockCount[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const closeWorkspace = useDomainWorkspaceClose();
  const adapter = DOMAIN_SURFACE_ADAPTERS[directive.domain];
  useEffect(() => { const controller = new AbortController(); const prepared = silentPreparationRuntime.consume(directive.domain); const request = prepared ? Promise.resolve(prepared) : fetch(adapter.endpoint, { credentials: "include", signal: controller.signal }).then((r) => r.json()); request.then((payload) => { if (!(payload as { ok?: boolean }).ok) throw new Error("canonical surface failed"); const data = (payload as { data: Record<string, unknown> }).data; const value = data[adapter.responseKey]; const loaded=Array.isArray(value)?value as Row[]:[];setRows(directive.entityId?loaded.filter((row)=>row.id===directive.entityId):loaded); setTotalCount(typeof data.count === "number" ? data.count : null); onReady(); }).catch(() => { if (!controller.signal.aborted) onFailure(); }); return () => controller.abort(); }, [adapter, directive, onFailure, onReady]);
  useEffect(() => setSelected(null), [directive.directiveId]);
  useEffect(() => { setQuery(""); setPage(1); }, [directive.directiveId]);
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
    .map((metric) => metricValue(metric, displayRows, totalCount)), [adapter.summaryMetrics, displayRows, totalCount]);
  function openRow(row: Row) {
    setSelected(row);
  }

  if (rows === null) return <div className="mx-auto max-w-5xl"><WorkspaceSurface title={directive.title} subtitle="Bilinen bilgiler hazırlanıyor…" identity={directive.entityId ? humanIdentity(directive.entityType, directive.entityId) : undefined}><div className="workspace-loading">{directive.title}</div></WorkspaceSurface></div>;

  const selectedActionSurface = selected ? (() => {
    const id = String(selected.id);
    if (directive.domain === "order") return <OrderActionSurface orderId={id}/>;
    if (directive.domain === "delivery") return <DeliveryActionSurface deliveryId={id}/>;
    if (directive.domain === "invoice") return <InvoiceActionSurface invoiceId={id}/>;
    if (directive.domain === "payment") return <PaymentActionSurface paymentId={id}/>;
    if (directive.domain === "supplier") return <SupplierEditSurface supplierId={id}/>;
    if (directive.domain === "customer") return <CustomerEditScreen customerId={id} presentation="living"/>;
    if (directive.domain === "task") return <TaskActionSurface taskId={id}/>;
    if (directive.domain === "product") return <ProductEditSurface productId={id}/>;
    if (directive.domain === "goal") return <GoalEditSurface goalId={id}/>;
    if (directive.domain === "offer") return <OfferEditScreen quoteId={id} presentation="living"/>;
    if (directive.domain === "production") return <ProductionOrderEditSurface productionOrderId={id}/>;
    return null;
  })() : null;

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredRows = normalizedQuery ? rows.filter((row) => listColumns.some((column) => String(row[column] ?? "").toLocaleLowerCase("tr-TR").includes(normalizedQuery))) : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 7));
  const currentPage = Math.min(page, pageCount);
  const secondaryColumn = adapter.summaryMetrics.find((metric) => metric !== "count" && listColumns.includes(metric)) ?? listColumns[1];
  const visibleRows = filteredRows.slice((currentPage - 1) * 7, currentPage * 7);
  const presentationRows: ApprovedDomainRow[] = visibleRows.map((row, index) => {
    const primary = primaryValue(row, listColumns);
    return { id: String(row.id ?? index), marker: String(primary).trim().charAt(0).toLocaleUpperCase("tr-TR") || "•", primaryLabel: humanLabel(listColumns[0] ?? directive.entityType), primaryValue: primary, secondaryLabel: secondaryColumn ? humanLabel(secondaryColumn) : undefined, secondaryValue: secondaryColumn ? humanValue(row[secondaryColumn], secondaryColumn, row.currency) : undefined, onOpen: adapter.supportedQuickActions.includes("open-detail") ? () => openRow(row) : undefined, accessory: directive.domain === "payment" ? <PaymentCollectionAccessory row={row} onOpen={() => openRow(row)} /> : undefined };
  });
  const prelude = stockIntelligence || pendingStockCounts.length ? <div className="approved-domain-prelude">{stockIntelligence ? <section data-testid="stock-intelligence-summary"><p>Stok sağlığı ve yönetsel sinyaller</p><strong>{stockIntelligence.healthSummary}</strong></section> : null}{pendingStockCounts.map((record) => <section data-testid="stock-variance-investigation" key={record.id}><span><strong>{record.stock?.productService?.name ?? "Stok kaydı"}</strong> · sistem {record.systemQuantityAtCount}, sayım {record.countedQuantity}</span><span><button onClick={() => void resolvePendingStockCount(record.id, "DISMISS", setPendingStockCounts, setStockIntelligence)} type="button">Reddet</button><button onClick={() => void resolvePendingStockCount(record.id, "CONFIRM", setPendingStockCounts, setStockIntelligence)} type="button">Onayla ve düzelt</button></span></section>)}</div> : undefined;
  const selectedFields = selected ? visibleColumns.filter((column) => Object.hasOwn(selected, column)).map((column) => ({ label: humanLabel(column), value: humanValue(selected[column], column, selected.currency) })) : [];
  const selectedMetrics = selectedFields.filter((field) => /(tutar|bakiye|stok|skor|oran|adet|miktar|fiyat|tutarı)/iu.test(field.label));
  return <div className="approved-domain-container" data-canonical-domain={directive.domain} data-canonical-view={selected ? "detail" : "list"} data-testid={directive.domain === "customer" ? "customer-workspace-card" : undefined}>
    <div aria-hidden={Boolean(selected)} className={selected ? "approved-domain-underlay is-detail-open" : "approved-domain-underlay"}><ApprovedDomainWorkspace title={humanTitle(directive.title)} subtitle={directive.subtitle} kpis={kpis} query={query} searchPlaceholder={`${humanTitle(directive.title)} ara…`} onQueryChange={(value) => { setQuery(value); setPage(1); }} rows={presentationRows} totalCount={filteredRows.length} page={currentPage} pageCount={pageCount} onPageChange={setPage} onClose={closeWorkspace} prelude={prelude}/></div>
    {selected && selectedActionSurface ? <div className="approved-detail-overlay"><ApprovedDetailWorkspace title={primaryValue(selected, listColumns)} marker={String(primaryValue(selected, listColumns)).trim().charAt(0).toLocaleUpperCase("tr-TR") || "•"} context={`${humanTitle(directive.title)} · ${String(selected.id).slice(0, 8)}`} fields={selectedFields} metrics={selectedMetrics} onBack={() => setSelected(null)}>{selectedActionSurface}</ApprovedDetailWorkspace></div> : null}
  </div>;
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

function PaymentCollectionAccessory({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const remaining = Math.max(finiteNumber(row.amount) - finiteNumber(row.paidAmount), 0);
  const [value, setValue] = useState(String(remaining));
  const threshold = useCollectionGoalThreshold();
  const state = resolveDataWeight(Number(value.replace(",", ".")), threshold);
  useEffect(() => setValue(String(remaining)), [remaining]);
  return <div className="approved-domain-row-accessory"><button onClick={onOpen} type="button">Tahsilat detayını aç</button><div data-executive-signature={state === "inactive" ? undefined : "verinin.agirligi"} data-weight-state={state}><input aria-label="Tahsil edilen tutar" inputMode="decimal" onChange={(event) => setValue(event.target.value)} type="text" value={value}/>{state !== "inactive" ? <p role="status">{state === "exceeded" ? "METRIX: Tahsilat hedefi aşılıyor; devam edebilirsiniz." : "METRIX: Gerçek tahsilat hedefine yaklaşıldı."}</p> : null}</div></div>;
}

let collectionGoalRequest: Promise<number | null> | null = null;
function useCollectionGoalThreshold() {
  const [threshold, setThreshold] = useState<number | null>(null);
  useEffect(() => { collectionGoalRequest ??= fetch("/api/goals?status=ACTIVE", { credentials: "include" }).then((response) => response.json()).then((payload) => { const goals = payload?.ok && Array.isArray(payload.data?.goals) ? payload.data.goals as Array<{ targetCollectionCents?: string | null }> : []; const cents = goals.map((goal) => Number(goal.targetCollectionCents)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)[0]; return cents ? cents / 100 : null; }).catch(() => null); void collectionGoalRequest.then(setThreshold); }, []);
  return threshold;
}

function metricValue(metric: string, rows: Row[], totalCount: number | null): WorkspaceField {
  // The list endpoint caps how many rows it returns (a payload-size limit);
  // rows.length is only "how many loaded", not the real total. Prefer the
  // endpoint's own separate count field when it supplied one — for domains
  // that haven't been given a real count query yet, this still equals
  // rows.length (their API's count field is rows.length itself today), so
  // this changes nothing for them.
  if (metric === "count") return { label: "Toplam kayıt", value: humanValue(totalCount ?? rows.length, metric) };
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
