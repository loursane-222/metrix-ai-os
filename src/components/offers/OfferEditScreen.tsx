"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useOfferEditSurfaceRuntime } from "@/lib/offers/use-offer-edit-surface-runtime";
import { cancelQuoteDispatch, confirmQuoteDispatch, executeQuoteSendAction, requestQuoteDispatch } from "@/lib/offers/quotes-client";
import type { QuoteDispatchRecipientPreview } from "@/lib/offers/quotes-client";
import type { OfferEditFieldValues, OfferEditItemLine } from "@/lib/offers/offer-edit-draft";
import { GlassCard, PageShell, PrimaryButton, SectionTitle } from "@/components/customers/ui";
import { ExecutiveStroke, PendingWorkRail, HandoffNotice } from "@/components/executive-signatures/SignatureComponents";

type TabId = "items" | "terms" | "notes" | "signal";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "items", label: "Kalemler" },
  { id: "terms", label: "Şartlar" },
  { id: "notes", label: "Notlar" },
  { id: "signal", label: "Sinyal" },
];

type IntelligencePayload = {
  intelligence: {
    customerInterest: { viewCount: number; lastViewedAt: string | null };
    negotiationDifficulty: { rounds: number };
    winProbability: { percent: number; sampleSize: number } | null;
    financialRisk: { overdueCount: number; overdueAmount: string; score: number } | null;
    strategicImportance: { customerWonTotal: string; organizationMedianWonTotal: string; relativePosition: string } | null;
    executiveScore: { score: number | null; heat: string | null; components: Array<{ dimension: string; score: number; evidence: string }>; method: string };
    unavailableDimensions: Array<{ dimension: string; reason: string }>;
  };
  customerScorecard: null | ({ sufficientData: false; sampleSize: number; message: string } | { sufficientData: true; sampleSize: number; winRate: number; avgDecisionDays: number | null; avgNegotiationRounds: number; dominantContestedTerm: string; unavailableBehaviors: string[] });
};

const INITIAL_TAB: TabId = "items";

function lineTotal(line: OfferEditItemLine): number {
  const gross = line.quantity * line.unitPrice;
  const afterDiscount = gross * (1 - line.discountPercent / 100);
  return afterDiscount * (1 + line.vatPercent / 100);
}

function grandTotal(items: OfferEditItemLine[], generalDiscountPercent: number | null): number {
  const sum = items.reduce((acc, item) => acc + lineTotal(item), 0);
  return generalDiscountPercent ? sum * (1 - generalDiscountPercent / 100) : sum;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
}

export function OfferEditScreen({ quoteId, presentation = "route", onSurfaceReady, onSurfaceFailure }: { quoteId: string; presentation?: "route" | "living"; onSurfaceReady?: () => void; onSurfaceFailure?: () => void }) {
  const { state, executeSurfaceAction } = useOfferEditSurfaceRuntime(quoteId, INITIAL_TAB);
  const { loading, loadError, quote, draftSnapshot, saving, saveError, savedAt, blockingMessage } = state;
  const tab = state.activeTab as TabId;
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNow, setSentNow] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", unit: "", unitPrice: "" });
  const [intelligence, setIntelligence] = useState<IntelligencePayload | null>(null);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);

  const [dispatchApproval, setDispatchApproval] = useState<{ approvalId: string } | null>(null);
  const [recipientPreview, setRecipientPreview] = useState<QuoteDispatchRecipientPreview | null>(null);
  const [dispatchRequesting, setDispatchRequesting] = useState(false);
  const [dispatchConfirming, setDispatchConfirming] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchedNow, setDispatchedNow] = useState<{ recipientEmail: string } | null>(null);
  useEffect(() => {
    if (loading) return;
    if (quote && draftSnapshot) onSurfaceReady?.();
    else onSurfaceFailure?.();
  }, [draftSnapshot, loading, onSurfaceFailure, onSurfaceReady, quote]);
  useEffect(() => {
    if (tab !== "signal" || intelligence || intelligenceLoading) return;
    setIntelligenceLoading(true);
    setIntelligenceError(null);
    void fetch(`/api/quotes/${encodeURIComponent(quoteId)}/intelligence`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; data?: IntelligencePayload; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message || "Teklif sinyalleri yüklenemedi.");
        setIntelligence(payload.data);
      })
      .catch((error: unknown) => setIntelligenceError(error instanceof Error ? error.message : "Teklif sinyalleri yüklenemedi."))
      .finally(() => setIntelligenceLoading(false));
  }, [intelligence, intelligenceLoading, quoteId, tab]);

  function set<K extends keyof OfferEditFieldValues>(key: K, value: OfferEditFieldValues[K]) {
    void executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: key, value } });
  }

  function setTab(tabId: TabId) {
    void executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId } });
  }

  async function save() {
    await executeSurfaceAction({ actionName: "draft.commit" });
  }

  function addItem() {
    if (!draftSnapshot) return;
    const quantity = Number(newItem.quantity);
    const unitPrice = Number(newItem.unitPrice);
    if (!newItem.name.trim() || !(quantity > 0) || !(unitPrice >= 0)) return;
    const items = (draftSnapshot.fieldValues as OfferEditFieldValues).items;
    const line: OfferEditItemLine = {
      localId: crypto.randomUUID(),
      productServiceId: null,
      name: newItem.name.trim(),
      unit: newItem.unit.trim(),
      quantity,
      unitPrice,
      discountPercent: 0,
      vatPercent: 0,
    };
    set("items", [...items, line]);
    setNewItem({ name: "", quantity: "1", unit: "", unitPrice: "" });
  }

  function removeItem(localId: string) {
    if (!draftSnapshot) return;
    const items = (draftSnapshot.fieldValues as OfferEditFieldValues).items;
    set("items", items.filter((item) => item.localId !== localId));
  }

  function updateItem(localId: string, patch: Partial<OfferEditItemLine>) {
    if (!draftSnapshot) return;
    const items = (draftSnapshot.fieldValues as OfferEditFieldValues).items;
    set("items", items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  async function sendToCustomer() {
    setSending(true);
    setSendError(null);
    const result = await executeQuoteSendAction(quoteId);
    setSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setSentNow(true);
  }

  async function startDispatchConfirmation() {
    setDispatchRequesting(true);
    setDispatchError(null);
    const result = await requestQuoteDispatch(quoteId);
    setDispatchRequesting(false);
    if (!result.ok) {
      setDispatchError(result.error);
      return;
    }
    setDispatchApproval({ approvalId: result.data.approval.approvalId });
    setRecipientPreview(result.data.recipientPreview);
  }

  async function confirmDispatch() {
    if (!dispatchApproval) return;
    setDispatchConfirming(true);
    setDispatchError(null);
    const result = await confirmQuoteDispatch(quoteId, dispatchApproval.approvalId);
    setDispatchConfirming(false);
    if (!result.ok) {
      setDispatchError(result.error);
      return;
    }
    const metadata = result.data.execution.metadata;
    const recipientEmail = metadata && typeof metadata.recipientEmail === "string" ? metadata.recipientEmail : recipientPreview?.status === "RESOLVED" ? recipientPreview.email : "";
    setDispatchedNow({ recipientEmail });
    setDispatchApproval(null);
  }

  async function cancelDispatchConfirmation() {
    if (dispatchApproval) await cancelQuoteDispatch(quoteId, dispatchApproval.approvalId);
    setDispatchApproval(null);
    setRecipientPreview(null);
  }

  if (loading) {
    return (
      <OfferPageShell presentation={presentation}>
        <p className="mt-10 text-center text-sm text-[#6f7a87]">Teklif yükleniyor...</p>
      </OfferPageShell>
    );
  }

  if (!quote || !draftSnapshot) {
    return (
      <OfferPageShell presentation={presentation}>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Teklif bulunamadı.</p>
          {loadError ? <p className="mt-2 text-xs text-[#6f7a87]">{loadError}</p> : null}
        </GlassCard>
      </OfferPageShell>
    );
  }

  const form = draftSnapshot.fieldValues as OfferEditFieldValues;
  const total = grandTotal(form.items, form.generalDiscountPercent);
  const canSend = (quote.status === "DRAFT" || quote.status === "NEGOTIATION") && form.items.length > 0;

  return (
    <OfferPageShell
      header={
        <header className="flex items-center justify-between py-1">
          <Link className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3e8eb]" href="/metrix/offers">
            ←
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-[#f4f7f8]">{quote.customerName}</p>
            <p className="text-[10px] text-[#6f7a87]">{quote.title} · {quote.status}</p>
          </div>
          <span className="w-9" />
        </header>
      }
      presentation={presentation}
    >
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? "border-[#34e6cf]/30 bg-[#34e6cf]/10 text-[#34e6cf]" : "border-white/10 bg-white/[0.03] text-[#93a0ad]"
            }`}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {tab === "items" ? (
          <>
            <GlassCard className="p-4">
              <SectionTitle>Teklif Kalemleri</SectionTitle>
              {form.items.length === 0 ? (
                <p className="text-sm text-[#6f7a87]">Henüz kalem eklenmedi.</p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item) => (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3" key={item.localId}>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          className={inputClass}
                          onChange={(e) => updateItem(item.localId, { name: e.target.value })}
                          value={item.name}
                        />
                        <button className="text-xs font-semibold text-[#f16a7a]" onClick={() => removeItem(item.localId)} type="button">
                          Sil
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <NumberField label="Miktar" onChange={(v) => updateItem(item.localId, { quantity: v })} value={item.quantity} />
                        <NumberField label="Birim Fiyat" onChange={(v) => updateItem(item.localId, { unitPrice: v })} value={item.unitPrice} />
                        <NumberField label="İskonto %" onChange={(v) => updateItem(item.localId, { discountPercent: v })} value={item.discountPercent} />
                        <NumberField label="KDV %" onChange={(v) => updateItem(item.localId, { vatPercent: v })} value={item.vatPercent} />
                      </div>
                      <p className="mt-2 text-right text-xs text-[#8b95a3]">{formatMoney(lineTotal(item), quote.currency)}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-dashed border-white/[0.12] p-3">
                <p className="mb-2 text-xs font-semibold text-[#8b95a3]">Yeni Kalem</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input className={inputClass} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Ürün adı" value={newItem.name} />
                  <input className={inputClass} inputMode="decimal" onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} placeholder="Miktar" value={newItem.quantity} />
                  <input className={inputClass} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} placeholder="Birim" value={newItem.unit} />
                  <input className={inputClass} inputMode="decimal" onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })} placeholder="Birim fiyat" value={newItem.unitPrice} />
                </div>
                <button className="mt-2 w-full rounded-xl border border-[#34e6cf]/30 bg-[#34e6cf]/10 py-2 text-xs font-semibold text-[#34e6cf]" onClick={addItem} type="button">
                  Kalem Ekle
                </button>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <SectionTitle>Genel İskonto ve Toplam</SectionTitle>
              <NumberField label="Genel İskonto %" onChange={(v) => set("generalDiscountPercent", v)} value={form.generalDiscountPercent ?? 0} />
              <p className="mt-3 text-right text-lg font-bold text-[#f4f7f8]">{formatMoney(total, quote.currency)}</p>
            </GlassCard>
          </>
        ) : null}

        {tab === "terms" ? (
          <GlassCard className="p-4">
            <SectionTitle>Teklif Şartları</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Geçerlilik Tarihi"><input className={inputClass} onChange={(e) => set("validUntil", e.target.value)} type="date" value={form.validUntil} /></Field>
              <Field label="Ödeme Şartı"><input className={inputClass} onChange={(e) => set("paymentTerm", e.target.value)} value={form.paymentTerm} /></Field>
              <Field label="Teslim Süresi"><input className={inputClass} onChange={(e) => set("deliveryTerm", e.target.value)} value={form.deliveryTerm} /></Field>
              <Field label="Teslimat Şekli"><input className={inputClass} onChange={(e) => set("deliveryMethod", e.target.value)} value={form.deliveryMethod} /></Field>
              <Field label="Özel Koşullar"><textarea className={`${inputClass} min-h-24 resize-none`} onChange={(e) => set("specialTerms", e.target.value)} value={form.specialTerms} /></Field>
            </div>
          </GlassCard>
        ) : null}

        {tab === "notes" ? (
          <GlassCard className="p-4">
            <SectionTitle>Müşteriye Görünen Not</SectionTitle>
            <textarea className={`${inputClass} min-h-28 resize-none`} onChange={(e) => set("customerNote", e.target.value)} value={form.customerNote} />
          </GlassCard>
        ) : null}

        {tab === "signal" ? <OfferSignalPanel data={intelligence} error={intelligenceError} loading={intelligenceLoading} /> : null}
      </div>

      {tab !== "signal" ? <div className="sticky bottom-4 mt-5 space-y-2 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="flex-1 text-center text-[10px] text-[#5c6673]">{savedAt ? "Kaydedildi." : `Durum: ${quote.status}`}</p>
          {blockingMessage ? (
            <button className="rounded-xl bg-[#34e6cf]/10 px-3 py-2 text-xs font-semibold text-[#34e6cf]" onClick={() => window.location.reload()} type="button">
              Sayfayı Yenile
            </button>
          ) : (
            <PrimaryButton disabled={saving || draftSnapshot.dirtyFields.length === 0} onClick={() => void save()}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </PrimaryButton>
          )}
        </div>
        <button
          className="w-full rounded-xl border border-[#34e6cf]/25 bg-[#34e6cf]/[0.06] py-2.5 text-sm font-semibold text-[#34e6cf] disabled:opacity-40"
          disabled={!canSend || sending || sentNow}
          onClick={() => void sendToCustomer()}
          type="button"
        >
          {sentNow || quote.status !== "DRAFT" && quote.status !== "NEGOTIATION" ? "Teklif Gönderildi" : sending ? "Gönderiliyor..." : "Teklifi Müşteriye Gönder"}
        </button>

        {sentNow || (quote.status !== "DRAFT" && quote.status !== "NEGOTIATION") ? (
          <OfferDispatchPanel
            approvalPending={dispatchApproval !== null}
            confirming={dispatchConfirming}
            dispatched={dispatchedNow ?? (quote.metadata?.emailDispatch ? { recipientEmail: quote.metadata.emailDispatch.recipientEmail } : null)}
            onCancel={() => void cancelDispatchConfirmation()}
            onConfirm={() => void confirmDispatch()}
            onStart={() => void startDispatchConfirmation()}
            recipientPreview={recipientPreview}
            requesting={dispatchRequesting}
          />
        ) : null}
      </div> : null}
      {blockingMessage ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{blockingMessage}</p> : saveError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{saveError}</p> : null}
      {sendError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{sendError}</p> : null}
      {dispatchError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{dispatchError}</p> : null}
    </OfferPageShell>
  );
}

function OfferSignalPanel({ data, error, loading }: { data: IntelligencePayload | null; error: string | null; loading: boolean }) {
  if (loading) return <GlassCard className="p-5"><p className="text-sm text-[#8b95a3]">Teklif sinyalleri hesaplanıyor...</p></GlassCard>;
  if (error || !data) return <GlassCard className="p-5"><p className="text-sm text-[#f16a7a]">{error ?? "Teklif sinyalleri yüklenemedi."}</p></GlassCard>;
  const { intelligence, customerScorecard } = data;
  const heatTone = intelligence.executiveScore.heat === "Sıcak" ? "border-[#ff8e66]/30 bg-[#ff8e66]/10 text-[#ffab8d]" : intelligence.executiveScore.heat === "Ilık" ? "border-[#e3b75f]/30 bg-[#e3b75f]/10 text-[#e8c77f]" : "border-[#63a9d8]/30 bg-[#63a9d8]/10 text-[#8cc4e8]";
  return <>
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3"><SectionTitle>Teklif Sıcaklığı</SectionTitle><span className={`rounded-full border px-3 py-1 text-xs font-bold ${heatTone}`}>{intelligence.executiveScore.heat ?? "Yetersiz veri"}</span></div>
      <p className="mt-2 text-3xl font-bold text-[#f4f7f8]">{intelligence.executiveScore.score ?? "—"}<span className="text-sm font-normal text-[#6f7a87]"> / 100</span></p>
      <p className="mt-2 text-xs leading-5 text-[#6f7a87]">{intelligence.executiveScore.method}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{intelligence.executiveScore.components.map((component) => <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3" key={component.dimension}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-[#dce3e6]">{component.dimension}</span><strong>{component.score}</strong></div><p className="mt-1 text-xs text-[#7d8995]">{component.evidence}</p></div>)}</div>
      <div className="mt-4 grid gap-2 text-xs text-[#a8b2bc] sm:grid-cols-2"><p>Görüntülenme: <strong>{intelligence.customerInterest.viewCount}</strong></p><p>Pazarlık turu: <strong>{intelligence.negotiationDifficulty.rounds}</strong></p>{intelligence.winProbability ? <p>Kazanma olasılığı: <strong>%{intelligence.winProbability.percent}</strong> ({intelligence.winProbability.sampleSize} örnek)</p> : <p>Kazanma olasılığı: <strong>Yetersiz veri</strong></p>}{intelligence.financialRisk ? <p>Gecikmiş ödeme: <strong>{intelligence.financialRisk.overdueCount}</strong> · {intelligence.financialRisk.overdueAmount}</p> : null}{intelligence.strategicImportance ? <p className="sm:col-span-2">Geçmiş kazanılmış toplam: <strong>{intelligence.strategicImportance.customerWonTotal}</strong> · Organizasyon medyanı {intelligence.strategicImportance.organizationMedianWonTotal} · {intelligence.strategicImportance.relativePosition}</p> : <p>Stratejik önem: <strong>Yetersiz organizasyon gelir geçmişi</strong></p>}</div>
    </GlassCard>
    <GlassCard className="p-5"><SectionTitle>Hesaplanamayan Boyutlar</SectionTitle><div className="space-y-2">{intelligence.unavailableDimensions.map((item) => <p className="rounded-xl bg-white/[.025] p-3 text-xs leading-5 text-[#9ca7b2]" key={item.dimension}><strong className="text-[#d2dae0]">Hesaplanamıyor: {item.dimension}</strong> — {item.reason}</p>)}</div></GlassCard>
    {customerScorecard ? <GlassCard className="p-5"><SectionTitle>Müşteri Karar Karnesi</SectionTitle>{customerScorecard.sufficientData ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Kazanma oranı" value={`%${customerScorecard.winRate}`} /><Metric label="Karar süresi" value={customerScorecard.avgDecisionDays === null ? "Yetersiz veri" : `${customerScorecard.avgDecisionDays} gün`} /><Metric label="Ort. pazarlık" value={`${customerScorecard.avgNegotiationRounds} tur`} /><Metric label="Karar odağı" value={customerScorecard.dominantContestedTerm} /></div><div className="mt-4 space-y-2">{customerScorecard.unavailableBehaviors.map((note) => <p className="text-xs leading-5 text-[#77838f]" key={note}>{note}</p>)}</div></> : <p className="rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-sm text-[#a8b2bc]">{customerScorecard.message}</p>}</GlassCard> : null}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider text-[#687480]">{label}</p><p className="mt-2 text-sm font-bold text-[#e1e7ea]">{value}</p></div>;
}

// Same living/route dual-mode primitive as CustomerEditScreen's PageHeaderShell:
// in "living" mode this renders inline inside the Living Workspace split view
// (no header, no fixed viewport chrome), in "route" mode it keeps the existing
// standalone PageShell (fixed viewport + header) for direct-URL entry.
// Living mode must not declare its own overflow-y-auto/h-full — LivingWorkspaceHost
// already owns a single min-h-0 flex-1 overflow-y-auto scroll region around this
// whole surface, and a nested one here can't resolve against a flex-grown, not
// fixed-height, ancestor, so the outer region ends up doing all the scrolling instead.
function OfferPageShell({ presentation, header, children }: { presentation: "route" | "living"; header?: ReactNode; children: ReactNode }) {
  if (presentation === "living") return <div className="mx-auto w-full max-w-3xl px-1 pb-6">{children}</div>;
  return <PageShell header={header}>{children}</PageShell>;
}

function OfferDispatchPanel({
  dispatched,
  approvalPending,
  recipientPreview,
  requesting,
  confirming,
  onStart,
  onConfirm,
  onCancel,
}: {
  dispatched: { recipientEmail: string } | null;
  approvalPending: boolean;
  recipientPreview: QuoteDispatchRecipientPreview | null;
  requesting: boolean;
  confirming: boolean;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (dispatched) {
    return <HandoffNotice status="completed" title={`Teklif e-posta ile gönderildi: ${dispatched.recipientEmail}`} />;
  }

  if (approvalPending) {
    const description =
      recipientPreview?.status === "RESOLVED"
        ? `Bu teklif "${recipientPreview.email}" adresine e-posta ile gönderilecek. Onaylıyor musunuz?`
        : recipientPreview?.status === "MISSING_EMAIL"
          ? "Müşterinin kayıtlı bir e-posta adresi yok — e-posta ile gönderim yapılamaz."
          : "Teklif henüz gönderilmedi.";
    return <PendingWorkRail work={{ title: "Teklif gönderimi bekliyor", nextStep: description, onPrimary: onConfirm, onCancel, primaryContent: recipientPreview?.status === "RESOLVED" ? <ExecutiveStroke label={confirming ? "Gönderiliyor…" : "Teklifin gönderileceğini onayla"} onCommit={onConfirm} onCancel={onCancel} /> : undefined }} />;
  }

  return <button className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-semibold text-[#93a0ad] disabled:opacity-40" disabled={requesting} onClick={onStart} type="button">{requesting ? "Kontrol ediliyor..." : "E-posta ile Gönder"}</button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="text-xs font-medium text-[#8b95a3]">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="text-[11px] font-medium text-[#8b95a3]">{label}</span>
      <input className={inputClass} inputMode="decimal" onChange={(e) => onChange(Number(e.target.value) || 0)} value={value} />
    </label>
  );
}

const inputClass = "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";
