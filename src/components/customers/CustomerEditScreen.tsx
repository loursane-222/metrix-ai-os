"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  archiveCustomer,
  formatDate,
  getCustomer,
  updateCustomer,
  type CustomerAddress,
  type CustomerRecord,
  type CustomerStatus,
} from "@/lib/customers/customers-client";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { GlassCard, PrimaryButton, SectionTitle } from "./ui";

type TabId = "identity" | "official" | "address" | "financial" | "system";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "identity", label: "Kimlik & Iletisim" },
  { id: "official", label: "Resmi Bilgiler" },
  { id: "address", label: "Adres Bilgileri" },
  { id: "financial", label: "Finansal Ayarlar" },
  { id: "system", label: "Sistem Bilgileri" },
];

type FormState = {
  displayName: string;
  legalName: string;
  contactFullName: string;
  contactTitle: string;
  phone: string;
  email: string;
  tier: string;
  metrixNote: string;
  cariKodu: string;
  taxNumber: string;
  taxOffice: string;
  mersisNo: string;
  tradeRegistryNo: string;
  currency: string;
  eInvoiceEnabled: boolean;
  eArchiveEnabled: boolean;
  billingAddress: Required<NonNullable<CustomerAddress>>;
  shippingAddress: Required<NonNullable<CustomerAddress>>;
  status: CustomerStatus;
};

const emptyAddress = { line1: "", line2: "", district: "", city: "", postalCode: "", country: "" };

function toForm(customer: CustomerRecord): FormState {
  return {
    displayName: customer.displayName,
    legalName: customer.legalName ?? "",
    contactFullName: customer.primaryContact?.fullName ?? "",
    contactTitle: customer.primaryContact?.title ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    tier: customer.tier ?? "",
    metrixNote: customer.metrixNote ?? "",
    cariKodu: customer.cariKodu ?? "",
    taxNumber: customer.taxNumber ?? "",
    taxOffice: customer.taxOffice ?? "",
    mersisNo: customer.mersisNo ?? "",
    tradeRegistryNo: customer.tradeRegistryNo ?? "",
    currency: customer.currency,
    eInvoiceEnabled: customer.eInvoiceEnabled,
    eArchiveEnabled: customer.eArchiveEnabled,
    billingAddress: { ...emptyAddress, ...(customer.billingAddress ?? {}) },
    shippingAddress: { ...emptyAddress, ...(customer.shippingAddress ?? {}) },
    status: customer.status,
  };
}

export function CustomerEditScreen({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("identity");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await getCustomer(customerId);
      if (cancelled) return;
      if (res.ok) {
        setCustomer(res.data.customer);
        setForm(toForm(res.data.customer));
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setBillingField(key: keyof FormState["billingAddress"], value: string) {
    setForm((prev) => (prev ? { ...prev, billingAddress: { ...prev.billingAddress, [key]: value } } : prev));
  }

  function setShippingField(key: keyof FormState["shippingAddress"], value: string) {
    setForm((prev) => (prev ? { ...prev, shippingAddress: { ...prev.shippingAddress, [key]: value } } : prev));
  }

  async function save() {
    if (!form) return;
    if (!form.displayName.trim()) {
      setSaveError("Firma adi gerekli.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await updateCustomer(customerId, {
      displayName: form.displayName.trim(),
      legalName: form.legalName || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      tier: form.tier || undefined,
      metrixNote: form.metrixNote || undefined,
      status: form.status,
      cariKodu: form.cariKodu || undefined,
      taxNumber: form.taxNumber || undefined,
      taxOffice: form.taxOffice || undefined,
      mersisNo: form.mersisNo || undefined,
      tradeRegistryNo: form.tradeRegistryNo || undefined,
      billingAddress: stripEmpty(form.billingAddress),
      shippingAddress: stripEmpty(form.shippingAddress),
      eInvoiceEnabled: form.eInvoiceEnabled,
      eArchiveEnabled: form.eArchiveEnabled,
      primaryContact:
        form.contactFullName || form.contactTitle || form.phone || form.email
          ? {
              fullName: form.contactFullName || undefined,
              title: form.contactTitle || undefined,
              phone: form.phone || undefined,
              email: form.email || undefined,
            }
          : undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    setCustomer(res.data.customer);
    setForm(toForm(res.data.customer));
    setSavedAt(Date.now());
  }

  async function passivate() {
    if (!customer) return;
    if (!window.confirm(`${customer.displayName} pasife alinsin mi?`)) return;
    setSaving(true);
    const res = await archiveCustomer(customer.id);
    setSaving(false);
    if (res.ok) {
      const refreshed = await getCustomer(customer.id);
      if (refreshed.ok) {
        setCustomer(refreshed.data.customer);
        setForm(toForm(refreshed.data.customer));
      }
    } else {
      setSaveError(res.error);
    }
  }

  if (loading) {
    return (
      <PageHeaderShell customerId={customerId}>
        <p className="mt-10 text-center text-sm text-[#6f7a87]">Musteri yukleniyor...</p>
      </PageHeaderShell>
    );
  }

  if (!customer || !form) {
    return (
      <PageHeaderShell customerId={customerId}>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Musteri bulunamadi.</p>
          {loadError ? <p className="mt-2 text-xs text-[#6f7a87]">{loadError}</p> : null}
        </GlassCard>
      </PageHeaderShell>
    );
  }

  return (
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
              <Field label="Yetkili Kisi">
                <input className={inputClass} onChange={(e) => set("contactFullName", e.target.value)} value={form.contactFullName} />
              </Field>
              <Field label="Unvan">
                <input className={inputClass} onChange={(e) => set("contactTitle", e.target.value)} value={form.contactTitle} />
              </Field>
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
              <Field label="Para Birimi">
                <select className={inputClass} onChange={(e) => set("currency", e.target.value)} value={form.currency}>
                  {["TRY", "USD", "EUR", "GBP"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
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
          disabled={saving || customer.status === "PASSIVE"}
          onClick={() => void passivate()}
          type="button"
        >
          Pasife Al
        </button>
        <p className="flex-1 text-center text-[10px] text-[#5c6673]">
          {savedAt ? "Kaydedildi." : `Son guncelleme: ${formatDate(customer.updatedAt)}`}
        </p>
        <PrimaryButton disabled={saving} onClick={() => void save()}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </PrimaryButton>
      </div>
      {saveError ? <p className="mt-2 text-center text-xs text-[#f16a7a]">{saveError}</p> : null}
    </PageHeaderShell>
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
  value: FormState["billingAddress"];
  onChange: (key: keyof FormState["billingAddress"], v: string) => void;
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

function stripEmpty(address: Record<string, string>): Record<string, unknown> | undefined {
  const entries = Object.entries(address).filter(([, v]) => v.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";
