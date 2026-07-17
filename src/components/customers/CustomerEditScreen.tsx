"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { formatDate, type CustomerStatus } from "@/lib/customers/customers-client";
import { isCustomerEditSaveDisabled, type CustomerEditAddress, type CustomerEditFieldValues } from "@/lib/customers/customer-edit-draft";
import { useCustomerEditSurfaceRuntime } from "@/lib/customers/use-customer-edit-surface-runtime";
import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { GlassCard, PrimaryButton, SectionTitle } from "./ui";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

// Same shape as MetrixWorkspace's apiPost — MetrixChatTab is host-agnostic and
// takes this as a prop rather than importing a fetch client itself.
async function apiPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

type TabId = "identity" | "official" | "address" | "financial" | "system";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "identity", label: "Kimlik & Iletisim" },
  { id: "official", label: "Resmi Bilgiler" },
  { id: "address", label: "Adres Bilgileri" },
  { id: "financial", label: "Finansal Ayarlar" },
  { id: "system", label: "Sistem Bilgileri" },
];

// The tab active when the Page Context/Draft are established. Not kept in
// sync on every tab switch — updating the context's activeTab on every
// switch would bump its version and immediately stale the in-flight draft
// (DraftRuntime rejects updateField/commitDraft once the context has moved
// past the draft's baseVersion). Tab navigation stays local Surface Runtime
// state (surface.select_tab), never written to the Page Context.
const INITIAL_TAB: TabId = "identity";

export function CustomerEditScreen({ customerId }: { customerId: string }) {
  // The Surface Runtime — not this component — owns customer/draft/tab/save
  // state. This hook only subscribes to it; a mutation dispatched from
  // outside React (an external caller holding the runtime instance) re-renders
  // this screen the same way a local dispatch does.
  const { state, executeSurfaceAction, archive } = useCustomerEditSurfaceRuntime(customerId, INITIAL_TAB);
  const { loading, loadError, customer, draftSnapshot, saving, saveError, savedAt, blockingMessage } = state;
  const tab = state.activeTab as TabId;

  // Chat entry point — mirrors MetrixWorkspace's floating METRIX button/overlay
  // pattern exactly (same MetrixChatTab component, same hasChatMounted-once
  // lazy-mount). This is what makes the runtime this screen just registered
  // into the Surface Command Channel reachable from written/voice chat at all.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasChatMounted, setHasChatMounted] = useState(false);
  function openChat() {
    setHasChatMounted(true);
    setIsChatOpen(true);
  }

  function set<K extends keyof CustomerEditFieldValues>(key: K, value: CustomerEditFieldValues[K]) {
    void executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: key, value } });
  }

  function setBillingField(key: keyof CustomerEditAddress, value: string) {
    if (!draftSnapshot) return;
    const current = draftSnapshot.fieldValues.billingAddress as CustomerEditAddress;
    set("billingAddress", { ...current, [key]: value });
  }

  function setShippingField(key: keyof CustomerEditAddress, value: string) {
    if (!draftSnapshot) return;
    const current = draftSnapshot.fieldValues.shippingAddress as CustomerEditAddress;
    set("shippingAddress", { ...current, [key]: value });
  }

  function setTab(tabId: TabId) {
    void executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId } });
  }

  async function save() {
    await executeSurfaceAction({ actionName: "draft.commit" });
  }

  async function passivate() {
    if (!customer) return;
    if (!window.confirm(`${customer.displayName} pasife alinsin mi?`)) return;
    await archive();
  }

  if (loading) {
    return (
      <PageHeaderShell customerId={customerId}>
        <p className="mt-10 text-center text-sm text-[#6f7a87]">Musteri yukleniyor...</p>
      </PageHeaderShell>
    );
  }

  if (!customer || !draftSnapshot) {
    return (
      <PageHeaderShell customerId={customerId}>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Musteri bulunamadi.</p>
          {loadError ? <p className="mt-2 text-xs text-[#6f7a87]">{loadError}</p> : null}
        </GlassCard>
      </PageHeaderShell>
    );
  }

  const form = draftSnapshot.fieldValues as CustomerEditFieldValues;

  return (
    <>
    <PageHeaderShell customerId={customerId}>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "border-[#34e6cf]/30 bg-[#34e6cf]/10 text-[#34e6cf]"
                : "border-white/10 bg-white/[0.03] text-[#93a0ad]"
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
        {tab === "identity" ? (
          <GlassCard className="p-4">
            <SectionTitle>Yonetim Alanlari</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Firma Adi *">
                <input className={inputClass} onChange={(e) => set("displayName", e.target.value)} value={form.displayName} />
              </Field>
              <ReadOnlyField label="Yetkili Kisi" value={customer.primaryContact?.fullName ?? "-"} />
              <ReadOnlyField label="Unvan" value={customer.primaryContact?.title ?? "-"} />
              <Field label="Musteri Grubu">
                <input className={inputClass} onChange={(e) => set("tier", e.target.value)} value={form.tier} />
              </Field>
              <Field label="Telefon">
                <input className={inputClass} onChange={(e) => set("phone", e.target.value)} value={form.phone} />
              </Field>
              <Field label="E-posta">
                <input className={inputClass} onChange={(e) => set("email", e.target.value)} type="email" value={form.email} />
              </Field>
              <Field className="md:col-span-2" label="Ticari Unvan">
                <input className={inputClass} onChange={(e) => set("legalName", e.target.value)} value={form.legalName} />
              </Field>
              <Field className="md:col-span-2" label="Notlar">
                <textarea
                  className={`${inputClass} min-h-24 resize-none`}
                  onChange={(e) => set("metrixNote", e.target.value)}
                  value={form.metrixNote}
                />
              </Field>
            </div>
          </GlassCard>
        ) : null}

        {tab === "official" ? (
          <GlassCard className="p-4">
            <SectionTitle>Resmi / Sistem Alanlari</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Cari Kodu">
                <input className={inputClass} onChange={(e) => set("cariKodu", e.target.value)} value={form.cariKodu} />
              </Field>
              <Field label="Vergi No / TCKN">
                <input className={inputClass} onChange={(e) => set("taxNumber", e.target.value)} value={form.taxNumber} />
              </Field>
              <Field label="Vergi Dairesi">
                <input className={inputClass} onChange={(e) => set("taxOffice", e.target.value)} value={form.taxOffice} />
              </Field>
              <Field label="MERSIS No">
                <input className={inputClass} onChange={(e) => set("mersisNo", e.target.value)} value={form.mersisNo} />
              </Field>
              <Field label="Ticaret Sicil No">
                <input className={inputClass} onChange={(e) => set("tradeRegistryNo", e.target.value)} value={form.tradeRegistryNo} />
              </Field>
            </div>
          </GlassCard>
        ) : null}

        {tab === "address" ? (
          <>
            <AddressForm
              onChange={setBillingField}
              title="Fatura Adresi"
              value={form.billingAddress}
            />
            <AddressForm
              onChange={setShippingField}
              title="Teslimat Adresi"
              value={form.shippingAddress}
            />
          </>
        ) : null}

        {tab === "financial" ? (
          <GlassCard className="p-4">
            <SectionTitle>Finansal Ayarlar</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <ReadOnlyField label="Para Birimi" value={customer.currency} />
              <div />
              <Field label="E-Fatura Durumu">
                <select
                  className={inputClass}
                  onChange={(e) => set("eInvoiceEnabled", e.target.value === "true")}
                  value={String(form.eInvoiceEnabled)}
                >
                  <option value="true">Aktif</option>
                  <option value="false">Pasif</option>
                </select>
              </Field>
              <Field label="E-Arsiv Durumu">
                <select
                  className={inputClass}
                  onChange={(e) => set("eArchiveEnabled", e.target.value === "true")}
                  value={String(form.eArchiveEnabled)}
                >
                  <option value="true">Aktif</option>
                  <option value="false">Pasif</option>
                </select>
              </Field>
            </div>
          </GlassCard>
        ) : null}

        {tab === "system" ? (
          <GlassCard className="p-4">
            <SectionTitle>Sistem Bilgileri</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Durum">
                <select
                  className={inputClass}
                  onChange={(e) => set("status", e.target.value as CustomerStatus)}
                  value={form.status}
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="PASSIVE">Pasif</option>
                  <option value="BLOCKED">Bloke</option>
                </select>
              </Field>
              <ReadOnlyField label="Kaynak" value={customer.source} />
              <ReadOnlyField label="Olusturulma" value={formatDate(customer.createdAt)} />
              <ReadOnlyField label="Guncellenme" value={formatDate(customer.updatedAt)} />
            </div>
          </GlassCard>
        ) : null}
      </div>

      <div className="sticky bottom-24 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl">
        <button
          className="rounded-xl px-3 py-2 text-xs font-semibold text-[#f16a7a] disabled:opacity-40"
          disabled={saving || !!blockingMessage || customer.status === "PASSIVE"}
          onClick={() => void passivate()}
          type="button"
        >
          Pasife Al
        </button>
        <p className="flex-1 text-center text-[10px] text-[#5c6673]">
          {savedAt ? "Kaydedildi." : `Son guncelleme: ${formatDate(customer.updatedAt)}`}
        </p>
        {blockingMessage ? (
          <button
            className="rounded-xl bg-[#34e6cf]/10 px-3 py-2 text-xs font-semibold text-[#34e6cf]"
            onClick={() => window.location.reload()}
            type="button"
          >
            Sayfayi Yenile
          </button>
        ) : (
          <PrimaryButton
            disabled={isCustomerEditSaveDisabled({ saving, draftSnapshot })}
            onClick={() => void save()}
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        )}
      </div>
      {blockingMessage ? (
        <p className="mt-2 text-center text-xs text-[#f16a7a]">{blockingMessage}</p>
      ) : saveError ? (
        <p className="mt-2 text-center text-xs text-[#f16a7a]">{saveError}</p>
      ) : null}
    </PageHeaderShell>

    <button
      aria-label="Metrix ile konus"
      className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#34e6cf] text-[11px] font-black leading-tight text-[#0a0d12] shadow-[0_8px_28px_rgba(52,230,207,0.45)]"
      onClick={openChat}
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
      type="button"
    >
      METRIX
    </button>

    {hasChatMounted ? (
      <div
        aria-hidden={!isChatOpen}
        className={`fixed inset-0 z-50 bg-black/55 p-0 transition-opacity md:p-6 ${
          isChatOpen ? "" : "pointer-events-none invisible opacity-0"
        }`}
      >
        <div className="ml-auto h-full w-full overflow-hidden bg-[#faf8f3] shadow-2xl md:max-w-[440px] md:rounded-lg">
          <div className="absolute right-3 top-3 z-10">
            <button
              aria-label="Sohbeti kapat"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#17120d] text-sm font-black text-white"
              onClick={() => setIsChatOpen(false)}
              type="button"
            >
              X
            </button>
          </div>
          <MetrixChatTab apiPost={apiPost} />
        </div>
      </div>
    ) : null}
    </>
  );
}

// Same viewport-fixed + inner-scroll primitive as CustomersListScreen/PageShell:
// the outer shell never scrolls, only the region below the header does, so the
// fixed dock never covers the form content or the save/archive footer.
function PageHeaderShell({ customerId, children }: { customerId: string; children: ReactNode }) {
  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-[#0a0d12] text-[#f4f7f8] [color-scheme:dark]">
      <div
        className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 md:max-w-3xl md:px-8"
        style={{ paddingTop: "calc(20px + env(safe-area-inset-top))" }}
      >
        <header className="flex shrink-0 items-center justify-between py-1">
          <Link
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3e8eb]"
            href={`/metrix/customers/${customerId}`}
          >
            <IconChevronLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-[#f4f7f8]">Musteri Bilgileri</p>
          </div>
          <span className="w-9" />
        </header>
        <div className="customers-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>{children}</div>
        </div>
      </div>
      <CustomersBottomNav />
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-xs font-medium text-[#8b95a3]">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-[#8b95a3]">{label}</span>
      <p className="mt-1.5 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 text-sm text-[#93a0ad]">
        {value}
      </p>
    </div>
  );
}

function AddressForm({
  title,
  value,
  onChange,
}: {
  title: string;
  value: CustomerEditAddress;
  onChange: (key: keyof CustomerEditAddress, v: string) => void;
}) {
  return (
    <GlassCard className="p-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <Field className="md:col-span-2" label="Adres Satiri">
          <input className={inputClass} onChange={(e) => onChange("line1", e.target.value)} value={value.line1} />
        </Field>
        <Field label="Ilce">
          <input className={inputClass} onChange={(e) => onChange("district", e.target.value)} value={value.district} />
        </Field>
        <Field label="Il">
          <input className={inputClass} onChange={(e) => onChange("city", e.target.value)} value={value.city} />
        </Field>
        <Field label="Posta Kodu">
          <input className={inputClass} onChange={(e) => onChange("postalCode", e.target.value)} value={value.postalCode} />
        </Field>
        <Field label="Ulke">
          <input className={inputClass} onChange={(e) => onChange("country", e.target.value)} value={value.country} />
        </Field>
      </div>
    </GlassCard>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";
