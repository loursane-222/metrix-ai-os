"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useOfferEditSurfaceRuntime } from "@/lib/offers/use-offer-edit-surface-runtime";
import { cancelQuoteDispatch, confirmQuoteDispatch, executeQuoteSendAction, requestQuoteDispatch } from "@/lib/offers/quotes-client";
import type { QuoteDispatchRecipientPreview } from "@/lib/offers/quotes-client";
import type { OfferEditFieldValues, OfferEditItemLine } from "@/lib/offers/offer-edit-draft";
import { GlassCard, PageShell, PrimaryButton, SectionTitle } from "@/components/customers/ui";

type TabId = "items" | "terms" | "notes";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "items", label: "Kalemler" },
  { id: "terms", label: "Şartlar" },
  { id: "notes", label: "Notlar" },
];

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

export function OfferEditScreen({ quoteId }: { quoteId: string }) {
  const { state, executeSurfaceAction } = useOfferEditSurfaceRuntime(quoteId, INITIAL_TAB);
  const { loading, loadError, quote, draftSnapshot, saving, saveError, savedAt, blockingMessage } = state;
  const tab = state.activeTab as TabId;
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNow, setSentNow] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", unit: "", unitPrice: "" });

  const [dispatchApproval, setDispatchApproval] = useState<{ approvalId: string } | null>(null);
  const [recipientPreview, setRecipientPreview] = useState<QuoteDispatchRecipientPreview | null>(null);
  const [dispatchRequesting, setDispatchRequesting] = useState(false);
  const [dispatchConfirming, setDispatchConfirming] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchedNow, setDispatchedNow] = useState<{ recipientEmail: string } | null>(null);

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
      <PageShell>
        <p className="mt-10 text-center text-sm text-[#6f7a87]">Teklif yükleniyor...</p>
      </PageShell>
    );
  }

  if (!quote || !draftSnapshot) {
    return (
      <PageShell>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Teklif bulunamadı.</p>
          {loadError ? <p className="mt-2 text-xs text-[#6f7a87]">{loadError}</p> : null}
        </GlassCard>
      </PageShell>
    );
  }

  const form = draftSnapshot.fieldValues as OfferEditFieldValues;
  const total = grandTotal(form.items, form.generalDiscountPercent);
  const canSend = (quote.status === "DRAFT" || quote.status === "NEGOTIATION") && form.items.length > 0;

  return (
    <PageShell
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
            </div>
          </GlassCard>
        ) : null}

        {tab === "notes" ? (
          <GlassCard className="p-4">
            <SectionTitle>Müşteriye Görünen Not</SectionTitle>
            <textarea className={`${inputClass} min-h-28 resize-none`} onChange={(e) => set("customerNote", e.target.value)} value={form.customerNote} />
          </GlassCard>
        ) : null}
      </div>

      <div className="sticky bottom-4 mt-5 space-y-2 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl">
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
      </div>
      {blockingMessage ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{blockingMessage}</p> : saveError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{saveError}</p> : null}
      {sendError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{sendError}</p> : null}
      {dispatchError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{dispatchError}</p> : null}
    </PageShell>
  );
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
    return <p className="text-center text-xs text-[#8b95a3]">E-posta ile gönderildi: {dispatched.recipientEmail}</p>;
  }

  if (approvalPending) {
    const description =
      recipientPreview?.status === "RESOLVED"
        ? `Bu teklif "${recipientPreview.email}" adresine e-posta ile gönderilecek. Onaylıyor musunuz?`
        : recipientPreview?.status === "MISSING_EMAIL"
          ? "Müşterinin kayıtlı bir e-posta adresi yok — e-posta ile gönderim yapılamaz."
          : "Teklif henüz gönderilmedi.";
    return (
      <div className="rounded-xl border border-dashed border-white/[0.12] p-3 text-center">
        <p className="text-xs text-[#8b95a3]">{description}</p>
        <div className="mt-2 flex gap-2">
          <button className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-2 text-xs font-semibold text-[#93a0ad]" onClick={onCancel} type="button">
            Vazgeç
          </button>
          {recipientPreview?.status === "RESOLVED" ? (
            <button className="flex-1 rounded-xl bg-[#34e6cf] py-2 text-xs font-bold text-[#062421] disabled:opacity-40" disabled={confirming} onClick={onConfirm} type="button">
              {confirming ? "Gönderiliyor..." : "Onayla ve Gönder"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <button className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-semibold text-[#93a0ad] disabled:opacity-40" disabled={requesting} onClick={onStart} type="button">
      {requesting ? "Kontrol ediliyor..." : "E-posta ile Gönder"}
    </button>
  );
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
