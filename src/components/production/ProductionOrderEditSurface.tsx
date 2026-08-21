"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getProductionOrder, updateProductionOrder, archiveProductionOrder, type ProductionOrderRecord, type ProductionOrderStatus } from "@/lib/production/productions-client";

type Draft = { status: ProductionOrderStatus; quantityPlanned: string; quantityProduced: string; notes: string };
const STATUS_LABELS: Record<ProductionOrderStatus, string> = { DRAFT: "Taslak", PLANNED: "Planlandı", RELEASED: "Serbest Bırakıldı", IN_PROGRESS: "Devam Ediyor", PAUSED: "Duraklatıldı", COMPLETED: "Tamamlandı", CANCELLED: "İptal Edildi" };
const inputClass = "w-full rounded-xl border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-[#EDE7D9] outline-none focus:border-[#34e6cf]/45";

export function ProductionOrderEditSurface({ productionOrderId, onReady, onFailure }: { productionOrderId: string; onReady?: () => void; onFailure?: () => void }) {
  const [order, setOrder] = useState<ProductionOrderRecord | null>(null);
  const [draft, setDraft] = useState<Draft>({ status: "DRAFT", quantityPlanned: "", quantityProduced: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await getProductionOrder(productionOrderId);
    if (result.ok) { setOrder(result.data.productionOrder); setDraft(toDraft(result.data.productionOrder)); setError(null); onReady?.(); }
    else { setError(result.error); onFailure?.(); }
  }, [onFailure, onReady, productionOrderId]);
  useEffect(() => { void load(); }, [load]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setNotice(null); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const result = await updateProductionOrder(productionOrderId, { status: draft.status, quantityPlanned: Number(draft.quantityPlanned), quantityProduced: Number(draft.quantityProduced), notes: draft.notes });
    if (result.ok) { setOrder(result.data.productionOrder); setDraft(toDraft(result.data.productionOrder)); setNotice("Üretim emri güncellendi."); }
    else setError(result.error);
    setBusy(false);
  }

  async function cancel() {
    setBusy(true); setError(null); setNotice(null);
    const result = await archiveProductionOrder(productionOrderId);
    if (result.ok) { await load(); setNotice("Üretim emri iptal edildi."); }
    else setError(result.error);
    setBusy(false);
  }

  if (!order && !error) return <p className="py-12 text-center text-sm text-[#7C7466]">Üretim emri yükleniyor…</p>;
  if (!order) return <Message error={error ?? "Üretim emri bulunamadı."} />;

  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-production-order-edit-surface={order.id}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Üretim emri çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">{order.orderNumber}</h2></div>
      <Badge>{STATUS_LABELS[order.status]}</Badge>
    </header>
    {error ? <Message error={error} /> : null}
    {notice ? <p className="rounded-xl border border-[#34e6cf]/20 bg-[#34e6cf]/10 p-3 text-sm text-[#34e6cf]" role="status">{notice}</p> : null}
    <form className="space-y-4" onSubmit={save}>
      <Card title="Üretim durumu">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Durum"><select aria-label="Durum" className={inputClass} value={draft.status} onChange={(event) => set("status", event.target.value as ProductionOrderStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Planlanan miktar"><input aria-label="Planlanan miktar" className={inputClass} min="0" step="0.001" type="number" value={draft.quantityPlanned} onChange={(event) => set("quantityPlanned", event.target.value)} /></Field>
          <Field label="Üretilen miktar"><input aria-label="Üretilen miktar" className={inputClass} min="0" step="0.001" type="number" value={draft.quantityProduced} onChange={(event) => set("quantityProduced", event.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Notlar"><Field label="Not"><textarea aria-label="Not" className={`${inputClass} min-h-28`} value={draft.notes} onChange={(event) => set("notes", event.target.value)} /></Field></Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="rounded-xl border border-[#f16a7a]/30 bg-[#f16a7a]/10 px-4 py-2.5 text-sm font-bold text-[#f16a7a] disabled:opacity-40" disabled={busy || order.status === "CANCELLED"} onClick={() => void cancel()} type="button">Üretim emrini iptal et</button>
        <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={busy} type="submit">Değişiklikleri kaydet</button>
      </div>
    </form>
  </div>;
}

function toDraft(order: ProductionOrderRecord): Draft { return { status: order.status, quantityPlanned: order.quantityPlanned, quantityProduced: order.quantityProduced, notes: order.notes ?? "" }; }
function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-medium text-[#A79F91]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs font-semibold text-[#C9BFA8]">{children}</span>; }
function Message({ error }: { error: string }) { return <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p>; }
