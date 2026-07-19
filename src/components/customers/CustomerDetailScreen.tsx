"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createPayment,
  createQuote,
  formatDate,
  formatTRY,
  getCustomer,
  type CustomerAddress,
  type CustomerRecord,
} from "@/lib/customers/customers-client";
import { CustomersBottomNav } from "./CustomersBottomNav";
import {
  IconBadge,
  IconChevronLeft,
  IconClose,
  IconFileText,
  IconGlobe,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPhone,
  IconShield,
  IconSparkle,
  IconWallet,
} from "./icons";
import {
  Avatar,
  DisabledPanel,
  FieldRow,
  GhostButton,
  GlassCard,
  KpiTile,
  PageShell,
  PrimaryButton,
  SectionTitle,
  StatusPill,
} from "./ui";

type TabId = "overview" | "financial" | "commercial" | "documents" | "ai";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Genel Bakis" },
  { id: "financial", label: "Finansal Durum" },
  { id: "commercial", label: "Ticari Gecmis" },
  { id: "documents", label: "Belgeler" },
  { id: "ai", label: "AI Degerlendirmesi" },
];

const UNCONNECTED_NOTE =
  "Bu gorunum icin bagli bir listeleme API'si henuz production'da degil. Sahte veri gosterilmiyor.";

export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [modal, setModal] = useState<"quote" | "payment" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await getCustomer(customerId);
      if (cancelled) return;
      if (res.ok) {
        setCustomer(res.data.customer);
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

  if (loading) {
    return (
      <>
        <PageShell header={<DetailHeader />}>
          <p className="mt-10 text-center text-sm text-[#6f7a87]">Musteri yukleniyor...</p>
        </PageShell>
        <CustomersBottomNav />
      </>
    );
  }

  if (!customer) {
    return (
      <>
        <PageShell header={<DetailHeader />}>
          <GlassCard className="mt-6 p-6 text-center">
            <p className="text-sm font-semibold text-[#f16a7a]">Musteri bulunamadi.</p>
            {loadError ? <p className="mt-2 text-xs text-[#6f7a87]">{loadError}</p> : null}
          </GlassCard>
        </PageShell>
        <CustomersBottomNav />
      </>
    );
  }

  return (
    <>
      <PageShell header={<DetailHeader customerId={customer.id} />}>
        <GlassCard className="mt-3 p-4" glow>
          <div className="flex items-start gap-3.5">
            <Avatar name={customer.displayName || "?"} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-[#f4f7f8]">{customer.displayName || "Isimsiz musteri"}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill status={customer.status} />
                {customer.tier ? <span className="text-xs text-[#8b95a3]">{customer.tier}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-[#f4f7f8]">{formatTRY(customer.balanceCents, customer.currency)}</p>
              <p className="text-[10px] text-[#6f7a87]">Guncel Bakiye</p>
            </div>
          </div>

          {customer.primaryContact?.fullName || customer.phone || customer.email ? (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              {customer.primaryContact?.fullName ? (
                <p className="text-sm font-medium text-[#e3e8eb]">
                  {customer.primaryContact.fullName}
                  {customer.primaryContact.title ? (
                    <span className="ml-1.5 text-xs text-[#6f7a87]">{customer.primaryContact.title}</span>
                  ) : null}
                </p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b95a3]">
                {(customer.primaryContact?.phone ?? customer.phone) ? (
                  <span className="flex items-center gap-1.5">
                    <IconPhone className="h-3.5 w-3.5" />
                    {customer.primaryContact?.phone ?? customer.phone}
                  </span>
                ) : null}
                {(customer.primaryContact?.email ?? customer.email) ? (
                  <span className="flex items-center gap-1.5">
                    <IconMail className="h-3.5 w-3.5" />
                    {customer.primaryContact?.email ?? customer.email}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </GlassCard>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
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
          {tab === "overview" ? <OverviewTab customer={customer} /> : null}
          {tab === "financial" ? (
            <GlassCard>
              <DisabledPanel note={UNCONNECTED_NOTE} title="Finansal hareket listesi bagli degil" />
            </GlassCard>
          ) : null}
          {tab === "commercial" ? (
            <GlassCard>
              <DisabledPanel note={UNCONNECTED_NOTE} title="Ticari gecmis listesi bagli degil" />
            </GlassCard>
          ) : null}
          {tab === "documents" ? (
            <GlassCard>
              <DisabledPanel note="Belge merkezi entegrasyonu bu surumde production'da degil." title="Belgeler bagli degil" />
            </GlassCard>
          ) : null}
          {tab === "ai" ? (
            <GlassCard>
              <DisabledPanel
                note="AI Genel Mudur musteri degerlendirmesi bu surumde bagli degil. Yorum uretilmiyor."
                title="AI degerlendirmesi bagli degil"
              />
            </GlassCard>
          ) : null}
        </div>

        <QuickActions
          customerId={customer.id}
          customerName={customer.displayName}
          currency={customer.currency}
          onOpenModal={setModal}
        />

        {modal === "quote" ? (
          <CreateQuoteModal
            currency={customer.currency}
            customerId={customer.id}
            onClose={() => setModal(null)}
          />
        ) : null}
        {modal === "payment" ? (
          <CreatePaymentModal
            currency={customer.currency}
            customerId={customer.id}
            onClose={() => setModal(null)}
          />
        ) : null}
      </PageShell>
      <CustomersBottomNav />
    </>
  );
}

function DetailHeader({ customerId }: { customerId?: string }) {
  return (
    <header className="flex items-center justify-between py-1">
      <Link
        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3e8eb]"
        href="/metrix/customers"
      >
        <IconChevronLeft className="h-[18px] w-[18px]" />
      </Link>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5c6673]">Musteri Detayi</p>
      {customerId ? (
        <Link
          className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-[#e3e8eb]"
          href={`/metrix/customers/${customerId}/edit`}
        >
          Duzenle
        </Link>
      ) : (
        <span className="w-9" />
      )}
    </header>
  );
}

function OverviewTab({ customer }: { customer: CustomerRecord }) {
  return (
    <>
      <div>
        <SectionTitle>Ozet Gostergeler</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiTile disabled icon={<IconWallet className="h-4 w-4" />} label="Toplam Satis" sublabel="Bagli degil" value="—" />
          <KpiTile disabled icon={<IconWallet className="h-4 w-4" />} label="Toplam Tahsilat" sublabel="Bagli degil" value="—" />
          <KpiTile disabled icon={<IconFileText className="h-4 w-4" />} label="Acik Teklif" sublabel="Bagli degil" value="—" />
          <KpiTile disabled icon={<IconPackage className="h-4 w-4" />} label="Aktif Siparis" sublabel="Bagli degil" value="—" />
          <KpiTile disabled icon={<IconFileText className="h-4 w-4" />} label="Ilk / Son Islem" sublabel="Bagli degil" value="—" />
        </div>
      </div>

      <GlassCard className="p-4">
        <SectionTitle>Kimlik &amp; Iletisim</SectionTitle>
        <div className="divide-y divide-white/[0.05]">
          <FieldRow icon={<IconBadge className="h-4 w-4" />} label="Cari Kodu" value={customer.cariKodu || "-"} />
          <FieldRow icon={<IconShield className="h-4 w-4" />} label="Vergi No" value={customer.taxNumber || "-"} />
          <FieldRow icon={<IconShield className="h-4 w-4" />} label="Vergi Dairesi" value={customer.taxOffice || "-"} />
          <FieldRow icon={<IconBadge className="h-4 w-4" />} label="MERSIS No" value={customer.mersisNo || "-"} />
          <FieldRow icon={<IconBadge className="h-4 w-4" />} label="Ticaret Sicil No" value={customer.tradeRegistryNo || "-"} />
          <FieldRow icon={<IconGlobe className="h-4 w-4" />} label="Para Birimi" value={customer.currency} />
          <FieldRow icon={<IconWallet className="h-4 w-4" />} label="Vade" value={customer.commercialTerms?.paymentTermDays === null || customer.commercialTerms?.paymentTermDays === undefined ? "-" : `${customer.commercialTerms.paymentTermDays} gün`} />
          <FieldRow icon={<IconWallet className="h-4 w-4" />} label="Kredi Limiti" value={customer.commercialTerms?.creditLimitCents ? formatTRY(customer.commercialTerms.creditLimitCents, customer.commercialTerms.defaultCurrency ?? customer.currency) : "-"} />
          <FieldRow
            badge={<StatusBadgeSmall on={customer.eInvoiceEnabled} />}
            icon={<IconFileText className="h-4 w-4" />}
            label="E-Fatura"
            value={customer.eInvoiceEnabled ? "Aktif" : "Pasif"}
          />
          <FieldRow
            badge={<StatusBadgeSmall on={customer.eArchiveEnabled} />}
            icon={<IconFileText className="h-4 w-4" />}
            label="E-Arsiv"
            value={customer.eArchiveEnabled ? "Aktif" : "Pasif"}
          />
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle>Adres Bilgileri</SectionTitle>
        <div className="space-y-3">
          <AddressBlock address={customer.billingAddress} icon={<IconMapPin className="h-4 w-4" />} title="Fatura Adresi" />
          <AddressBlock address={customer.shippingAddress} icon={<IconMapPin className="h-4 w-4" />} title="Teslimat Adresi" />
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle>Musteri Hafizasi</SectionTitle>
        {customer.metrixNote ? (
          <p className="text-sm leading-relaxed text-[#c7ced4]">{customer.metrixNote}</p>
        ) : (
          <p className="text-sm text-[#5c6673]">Henuz not eklenmedi.</p>
        )}
      </GlassCard>

      {customer.customFieldValues?.length ? <GlassCard className="p-4"><SectionTitle>Özel Alanlar</SectionTitle><div className="divide-y divide-white/[0.05]">{customer.customFieldValues.map((item) => <FieldRow icon={<IconBadge className="h-4 w-4" />} key={item.definitionId} label={item.label ?? item.definitionId} value={String(item.value)} />)}</div></GlassCard> : null}

      <GlassCard className="p-4">
        <SectionTitle>Iliski Skoru</SectionTitle>
        {customer.healthScore !== null ? (
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-[#f4f7f8]">{customer.healthScore} / 100</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#34e6cf]"
                style={{ width: `${Math.max(0, Math.min(100, customer.healthScore))}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#5c6673]">Skor girilmemis.</p>
        )}
      </GlassCard>

      <GlassCard>
        <DisabledPanel
          note="AI Genel Mudur musteri degerlendirmesi bu surumde bagli degil. Potansiyel ve risk seviyesi icin yorum uretilmiyor."
          title="AI Genel Mudur Degerlendirmesi bagli degil"
        />
      </GlassCard>
    </>
  );
}

function StatusBadgeSmall({ on }: { on: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        on ? "bg-[#123b2c] text-[#3ddc97]" : "bg-white/[0.06] text-[#6f7a87]"
      }`}
    >
      {on ? "Aktif" : "Pasif"}
    </span>
  );
}

function AddressBlock({ title, address, icon }: { title: string; address: CustomerAddress; icon: ReactNode }) {
  const hasContent = address && Object.values(address).some((v) => v && String(v).trim().length > 0);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[#6f7a87]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#6f7a87]">{title}</p>
        {hasContent ? (
          <p className="mt-0.5 text-sm leading-snug text-[#e3e8eb]">
            {[address?.line1, address?.line2, address?.district, address?.city, address?.postalCode, address?.country]
              .filter(Boolean)
              .join(", ")}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-[#5c6673]">Adres girilmemis.</p>
        )}
      </div>
    </div>
  );
}

function QuickActions({
  onOpenModal,
}: {
  customerId: string;
  customerName: string;
  currency: string;
  onOpenModal: (modal: "quote" | "payment") => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2.5">
      <button
        className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-xs font-semibold text-[#e3e8eb]"
        onClick={() => onOpenModal("quote")}
        type="button"
      >
        <IconFileText className="h-5 w-5 text-[#34e6cf]" />
        Teklif Olustur
      </button>
      <button
        className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.05] bg-white/[0.015] py-3.5 text-xs font-semibold text-[#4c5560] opacity-55"
        disabled
        title="Siparis olusturma bu surumde bagli degil."
        type="button"
      >
        <IconPackage className="h-5 w-5" />
        Siparis Olustur
      </button>
      <button
        className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-xs font-semibold text-[#e3e8eb]"
        onClick={() => onOpenModal("payment")}
        type="button"
      >
        <IconWallet className="h-5 w-5 text-[#34e6cf]" />
        Tahsilat Ekle
      </button>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#0f1319] p-5 md:rounded-[28px]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#f4f7f8]">{title}</h3>
          <button
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-[#93a0ad]"
            onClick={onClose}
            type="button"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[#8b95a3]">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";

function CreateQuoteModal({ customerId, currency, onClose }: { customerId: string; currency: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function submit() {
    if (!title.trim()) {
      setError("Baslik gerekli.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createQuote({
      customerId,
      title: title.trim(),
      amount: amount ? Number(amount) : undefined,
      currency,
      notes: notes.trim() || undefined,
      idempotencyKey,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 900);
  }

  return (
    <ModalShell onClose={onClose} title="Teklif Olustur">
      {success ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#3ddc97]">
          <IconSparkle className="h-4 w-4" /> Teklif olusturuldu.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <ModalField label="Baslik *">
            <input className={inputClass} onChange={(e) => setTitle(e.target.value)} value={title} />
          </ModalField>
          <ModalField label={`Tutar (${currency})`}>
            <input className={inputClass} min={0} onChange={(e) => setAmount(e.target.value)} type="number" value={amount} />
          </ModalField>
          <ModalField label="Notlar">
            <textarea className={`${inputClass} min-h-20 resize-none`} onChange={(e) => setNotes(e.target.value)} value={notes} />
          </ModalField>
          {error ? <p className="text-xs text-[#f16a7a]">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>Vazgec</GhostButton>
            <PrimaryButton disabled={saving} onClick={() => void submit()}>
              {saving ? "Kaydediliyor..." : "Olustur"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function CreatePaymentModal({ customerId, currency, onClose }: { customerId: string; currency: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function submit() {
    if (!title.trim()) {
      setError("Baslik gerekli.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Gecerli bir tutar girin.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createPayment({
      customerId,
      title: title.trim(),
      amount: Number(amount),
      currency,
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
      idempotencyKey,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 900);
  }

  return (
    <ModalShell onClose={onClose} title="Tahsilat Ekle">
      {success ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#3ddc97]">
          <IconSparkle className="h-4 w-4" /> Tahsilat kaydi olusturuldu.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <ModalField label="Baslik *">
            <input className={inputClass} onChange={(e) => setTitle(e.target.value)} value={title} />
          </ModalField>
          <ModalField label={`Tutar (${currency}) *`}>
            <input className={inputClass} min={0} onChange={(e) => setAmount(e.target.value)} type="number" value={amount} />
          </ModalField>
          <ModalField label="Vade Tarihi">
            <input className={inputClass} onChange={(e) => setDueDate(e.target.value)} type="date" value={dueDate} />
          </ModalField>
          <ModalField label="Notlar">
            <textarea className={`${inputClass} min-h-20 resize-none`} onChange={(e) => setNotes(e.target.value)} value={notes} />
          </ModalField>
          {error ? <p className="text-xs text-[#f16a7a]">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>Vazgec</GhostButton>
            <PrimaryButton disabled={saving} onClick={() => void submit()}>
              {saving ? "Kaydediliyor..." : "Ekle"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
