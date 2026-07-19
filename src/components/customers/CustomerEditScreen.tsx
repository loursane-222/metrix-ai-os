"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/customers/customers-client";
import { isCustomerEditSaveDisabled, type CustomerEditAddress, type CustomerEditFieldValues } from "@/lib/customers/customer-edit-draft";
import { useCustomerEditSurfaceRuntime } from "@/lib/customers/use-customer-edit-surface-runtime";
import { useExecutivePresenceCustomerUpdateActionProducer } from "@/components/executive-presence/useExecutivePresenceCustomerUpdateActionProducer";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { GlassCard, PrimaryButton, SectionTitle } from "./ui";
import { listCustomerFieldDefinitions } from "@/lib/customers/customers-client";
import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";
import { CUSTOMER_BUILT_IN_FIELDS, CUSTOMER_FIELD_SECTIONS } from "@/lib/customers/customer-field-registry";
import { useUniversalInputRegistrations, type UniversalRegistrationInput } from "@/components/input-authority";
import { customerAuthorityKey, customerFieldDescriptor, customerSectionTargetId, customerTabPanelTargetId, customerTabTargetId, customerTargetId } from "@/lib/customers/customer-universal-input-adapter";

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
  const fieldElements = useRef(new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>());
  const registerFieldElement = useCallback((fieldId: string, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => { if (element) fieldElements.current.set(fieldId, element); else fieldElements.current.delete(fieldId); }, []);
  const [customDefinitions, setCustomDefinitions] = useState<ModuleFieldDefinition[]>([]);
  useEffect(() => { void listCustomerFieldDefinitions().then((result) => { if (result.ok) setCustomDefinitions(result.data.fields); }); }, []);
  const executeCustomerUpdateAction = useExecutivePresenceCustomerUpdateActionProducer();
  // The Surface Runtime — not this component — owns customer/draft/tab/save
  // state. This hook only subscribes to it; a mutation dispatched from
  // outside React (an external caller holding the runtime instance) re-renders
  // this screen the same way a local dispatch does.
  const { state, executeSurfaceAction, archive, requestArchive, cancelArchive } = useCustomerEditSurfaceRuntime(
    customerId,
    INITIAL_TAB,
    executeCustomerUpdateAction,
  );
  const { loading, loadError, customer, draftSnapshot, saving, saveError, savedAt, blockingMessage } = state;
  const tab = state.activeTab as TabId;

  const universalRegistrations = useMemo<readonly UniversalRegistrationInput[]>(() => {
    const surfaceId = customerTargetId("edit", "surface", "form", customerId);
    const pageId = customerTargetId("edit", "page", "customers", customerId);
    const workspaceId = customerTargetId("edit", "surface", "workspace", customerId);
    const tabListId = customerTargetId("edit", "surface", "tabs", customerId);
    const fields = [...CUSTOMER_BUILT_IN_FIELDS, ...customDefinitions];
    const readField = (field: ModuleFieldDefinition): unknown => readEditField(state.draftSnapshot?.fieldValues, field);
    const writeField = (field: ModuleFieldDefinition, value: unknown) => executeSurfaceAction({ actionName: "draft.set_field", payload: editFieldPayload(state.draftSnapshot?.fieldValues, field, value) });
    return [
      { descriptor: { executiveTargetId: pageId, authorityKey: "customers.edit.page", targetKind: "page", surfaceType: "page", module: "customers", entityType: "customer", entityId: customerId, label: "Müşteri düzenle", readable: true, visibility: "visible", active: true, mounted: true, rootPageId: pageId, order: 0 }, adapter: {} },
      { descriptor: { executiveTargetId: workspaceId, authorityKey: "customers.edit.workspace", targetKind: "surface", surfaceType: "edit", module: "customers", entityType: "customer", entityId: customerId, label: "Müşteri düzenleme çalışma alanı", parentTargetId: pageId, rootPageId: pageId, visibility: "visible", active: true, mounted: true, focusScope: true, order: 1 }, adapter: {} },
      { descriptor: { executiveTargetId: surfaceId, authorityKey: "customers.customer.edit", targetKind: "surface", surfaceType: "form", module: "customers", entityType: "customer", entityId: customerId, label: "Müşteri düzenleme formu", parentTargetId: workspaceId, rootPageId: pageId, readable: true, mutable: true, supportsDraft: true, visibility: "visible", active: true, mounted: true, order: 2 }, adapter: { validate: () => ({ valid: String(readEditField(state.draftSnapshot?.fieldValues, CUSTOMER_BUILT_IN_FIELDS[0]) ?? "").trim().length > 0, message: "Firma adı gerekli." }), commit: () => executeSurfaceAction({ actionName: "draft.commit" }), cancel: () => executeSurfaceAction({ actionName: "draft.discard" }) } },
      { descriptor: { executiveTargetId: tabListId, authorityKey: "customers.edit.tabs", targetKind: "surface", surfaceType: "tab_list", module: "customers", entityType: "customer", entityId: customerId, label: "Müşteri düzenleme sekmeleri", parentTargetId: surfaceId, rootPageId: pageId, visibility: "visible", active: true, mounted: true, selectedChildTargetId: customerTabTargetId(customerId, tab), order: 3 }, adapter: { select: (value) => typeof value === "string" ? executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: value } }) : undefined } },
      ...TABS.flatMap((item, index): UniversalRegistrationInput[] => { const tabId = customerTabTargetId(customerId, item.id); const panelId = customerTabPanelTargetId(customerId, item.id); const selected = tab === item.id; return [{ descriptor: { executiveTargetId: tabId, authorityKey: `customers.edit.tab.${item.id}`, targetKind: "surface", surfaceType: "tab", module: "customers", entityType: "customer", entityId: customerId, label: item.label, parentTargetId: tabListId, rootPageId: pageId, visibility: "visible", active: selected, selected, activatable: true, selectable: true, order: 10 + index }, adapter: { activate: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: item.id } }), select: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: item.id } }) } }, { descriptor: { executiveTargetId: panelId, authorityKey: `customers.edit.tab-panel.${item.id}`, targetKind: "surface", surfaceType: "tab_panel", module: "customers", entityType: "customer", entityId: customerId, label: `${item.label} paneli`, parentTargetId: tabId, rootPageId: pageId, visibility: selected ? "visible" : "hidden", active: selected, mounted: selected, activatable: true, order: 20 + index }, adapter: { reveal: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: item.id } }), activate: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: item.id } }) } }]; }),
      ...CUSTOMER_FIELD_SECTIONS.filter((section) => fields.some((field) => field.uiSection === section)).map((section, index): UniversalRegistrationInput => { const sectionTab = editTabForSection(section); const selected = tab === sectionTab; return { descriptor: { executiveTargetId: customerSectionTargetId("edit", section, customerId), authorityKey: `customers.edit.section.${index}`, targetKind: "section", surfaceType: "section", module: "customers", entityType: "customer", entityId: customerId, label: section, parentTargetId: customerTabPanelTargetId(customerId, sectionTab), rootPageId: pageId, visibility: selected ? "visible" : "hidden", active: selected, mounted: selected, expanded: true, expandable: true, order: 30 + index }, adapter: { reveal: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: sectionTab } }), expand: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: sectionTab } }) } }; }),
      ...fields.map((field): UniversalRegistrationInput => ({ descriptor: customerFieldDescriptor(field, "edit", customerId), adapter: { read: () => readField(field), ...(field.writable ? { set: (value: unknown) => writeField(field, value), clear: () => writeField(field, undefined), reveal: () => executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: editTabForField(field) } }), focus: async () => { await executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: editTabForField(field) } }); await Promise.resolve(); fieldElements.current.get(field.fieldId)?.focus(); }, validate: () => ({ valid: !(field.requiredOnUpdate && !readField(field)), missing: field.requiredOnUpdate && !readField(field) }) } : {}) } })),
      { descriptor: { executiveTargetId: customerTargetId("edit", "action", "commit", customerId), authorityKey: customerAuthorityKey("commit"), targetKind: "action", module: "customers", entityType: "customer", entityId: customerId, label: "Değişiklikleri kaydet", parentTargetId: surfaceId, actionName: "draft.commit", commitActionName: "draft.commit", mutable: true, supportsDraft: true, order: 10000 }, adapter: { commit: () => executeSurfaceAction({ actionName: "draft.commit" }) } },
      { descriptor: { executiveTargetId: customerTargetId("edit", "action", "cancel", customerId), authorityKey: customerAuthorityKey("cancel"), targetKind: "action", module: "customers", entityType: "customer", entityId: customerId, label: "Değişiklikleri at", parentTargetId: surfaceId, actionName: "draft.discard", mutable: true, supportsDraft: true, order: 10001 }, adapter: { cancel: () => executeSurfaceAction({ actionName: "draft.discard" }) } },
    ];
  }, [customerId, customDefinitions, executeSurfaceAction, state.draftSnapshot, tab]);
  useUniversalInputRegistrations(universalRegistrations);

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
  function setPrimaryField(key: keyof CustomerEditFieldValues["primaryContact"], value: string) { if (!draftSnapshot) return; set("primaryContact", { ...draftSnapshot.fieldValues.primaryContact as CustomerEditFieldValues["primaryContact"], [key]: value }); }
  function setCommercialTerm(key: keyof CustomerEditFieldValues["commercialTerms"], value: string) { if (!draftSnapshot) return; const numeric = ["paymentTermDays", "creditLimitCents", "discountRateBasisPoints"].includes(key) ? (value === "" ? null : Number(value)) : value; set("commercialTerms", { ...draftSnapshot.fieldValues.commercialTerms as CustomerEditFieldValues["commercialTerms"], [key]: numeric }); }
  function setCustomField(definitionId: string, value: unknown) { if (!draftSnapshot) return; set("customFields", [...(draftSnapshot.fieldValues.customFields as CustomerEditFieldValues["customFields"]).filter((item) => item.definitionId !== definitionId), { definitionId, value }]); }

  function setTab(tabId: TabId) {
    void executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId } });
  }

  async function save() {
    await executeSurfaceAction({ actionName: "draft.commit" });
  }

  async function passivate() {
    if (!customer) return;
    await requestArchive();
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
                <input className={inputClass} ref={(element) => registerFieldElement("customer.displayName", element)} onChange={(e) => set("displayName", e.target.value)} value={form.displayName} />
              </Field>
              <Field label="Yetkili Kişi"><input className={inputClass} ref={(element) => registerFieldElement("customer.primaryContact.fullName", element)} onChange={(e) => setPrimaryField("fullName", e.target.value)} value={form.primaryContact.fullName} /></Field>
              <Field label="Yetkili Unvanı"><input className={inputClass} ref={(element) => registerFieldElement("customer.primaryContact.title", element)} onChange={(e) => setPrimaryField("title", e.target.value)} value={form.primaryContact.title} /></Field>
              <Field label="Yetkili Telefonu"><input className={inputClass} ref={(element) => registerFieldElement("customer.primaryContact.phone", element)} onChange={(e) => setPrimaryField("phone", e.target.value)} value={form.primaryContact.phone} /></Field>
              <Field label="Yetkili E-postası"><input className={inputClass} ref={(element) => registerFieldElement("customer.primaryContact.email", element)} onChange={(e) => setPrimaryField("email", e.target.value)} type="email" value={form.primaryContact.email} /></Field>
              <Field label="Musteri Grubu">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.tier", element)} onChange={(e) => set("tier", e.target.value)} value={form.tier} />
              </Field>
              <Field label="Telefon">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.phone", element)} onChange={(e) => set("phone", e.target.value)} value={form.phone} />
              </Field>
              <Field label="E-posta">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.email", element)} onChange={(e) => set("email", e.target.value)} type="email" value={form.email} />
              </Field>
              <Field className="md:col-span-2" label="Ticari Unvan">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.legalName", element)} onChange={(e) => set("legalName", e.target.value)} value={form.legalName} />
              </Field>
              <Field className="md:col-span-2" label="Notlar">
                <textarea
                  className={`${inputClass} min-h-24 resize-none`}
                  ref={(element) => registerFieldElement("customer.metrixNote", element)} onChange={(e) => set("metrixNote", e.target.value)}
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
                <input className={inputClass} ref={(element) => registerFieldElement("customer.cariKodu", element)} onChange={(e) => set("cariKodu", e.target.value)} value={form.cariKodu} />
              </Field>
              <Field label="Vergi No / TCKN">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.taxNumber", element)} onChange={(e) => set("taxNumber", e.target.value)} value={form.taxNumber} />
              </Field>
              <Field label="Vergi Dairesi">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.taxOffice", element)} onChange={(e) => set("taxOffice", e.target.value)} value={form.taxOffice} />
              </Field>
              <Field label="MERSIS No">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.mersisNo", element)} onChange={(e) => set("mersisNo", e.target.value)} value={form.mersisNo} />
              </Field>
              <Field label="Ticaret Sicil No">
                <input className={inputClass} ref={(element) => registerFieldElement("customer.tradeRegistryNo", element)} onChange={(e) => set("tradeRegistryNo", e.target.value)} value={form.tradeRegistryNo} />
              </Field>
            </div>
          </GlassCard>
        ) : null}

        {tab === "address" ? (
          <>
            <AddressForm
              fieldPrefix="billingAddress"
              registerFieldElement={registerFieldElement}
              onChange={setBillingField}
              title="Fatura Adresi"
              value={form.billingAddress}
            />
            <AddressForm
              fieldPrefix="shippingAddress"
              registerFieldElement={registerFieldElement}
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
              <Field label="Para Birimi"><select className={inputClass} ref={(element) => registerFieldElement("customer.currency", element)} onChange={(e) => set("currency", e.target.value)} value={form.currency}>{["TRY", "USD", "EUR", "GBP"].map((currency) => <option key={currency}>{currency}</option>)}</select></Field>
              <Field label="Vade (gün)"><input className={inputClass} ref={(element) => registerFieldElement("customer.commercialTerms.paymentTermDays", element)} inputMode="numeric" onChange={(e) => setCommercialTerm("paymentTermDays", e.target.value)} value={form.commercialTerms.paymentTermDays ?? ""} /></Field>
              <Field label="Kredi Limiti (kuruş)"><input className={inputClass} ref={(element) => registerFieldElement("customer.commercialTerms.creditLimitCents", element)} inputMode="numeric" onChange={(e) => setCommercialTerm("creditLimitCents", e.target.value)} value={form.commercialTerms.creditLimitCents ?? ""} /></Field>
              <Field label="İskonto (baz puan)"><input className={inputClass} ref={(element) => registerFieldElement("customer.commercialTerms.discountRateBasisPoints", element)} inputMode="numeric" onChange={(e) => setCommercialTerm("discountRateBasisPoints", e.target.value)} value={form.commercialTerms.discountRateBasisPoints ?? ""} /></Field>
              <Field label="E-Fatura Durumu">
                <select
                  className={inputClass}
                  ref={(element) => registerFieldElement("customer.eInvoiceEnabled", element)}
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
                  ref={(element) => registerFieldElement("customer.eArchiveEnabled", element)}
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

        {tab === "financial" && customDefinitions.length ? <GlassCard className="p-4"><SectionTitle>Özel Alanlar</SectionTitle><div className="grid gap-3 md:grid-cols-2">{customDefinitions.map((field) => <Field key={field.fieldId} label={field.label}><input className={inputClass} ref={(element) => registerFieldElement(field.fieldId, element)} onChange={(event) => setCustomField(field.fieldId.replace("customer.custom.", ""), event.target.value)} value={String(form.customFields.find((item) => `customer.custom.${item.definitionId}` === field.fieldId)?.value ?? "")} /></Field>)}</div></GlassCard> : null}

        {tab === "system" ? (
          <GlassCard className="p-4">
            <SectionTitle>Sistem Bilgileri</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <ReadOnlyField label="Durum" value={form.status} />
              <ReadOnlyField label="Kaynak" value={customer.source} />
              <ReadOnlyField label="Olusturulma" value={formatDate(customer.createdAt)} />
              <ReadOnlyField label="Guncellenme" value={formatDate(customer.updatedAt)} />
            </div>
          </GlassCard>
        ) : null}
      </div>

      <div className="sticky bottom-24 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl">
        {state.archiveApproval ? <>
        <button className="rounded-xl px-3 py-2 text-xs font-semibold text-[#8b95a3]" onClick={() => void cancelArchive()} type="button">Vazgec</button>
        <button className="rounded-xl px-3 py-2 text-xs font-semibold text-[#f16a7a]" disabled={saving} onClick={() => void archive()} type="button">Pasife Almayi Onayla</button>
        </> : <button
          className="rounded-xl px-3 py-2 text-xs font-semibold text-[#f16a7a] disabled:opacity-40"
          disabled={saving || !!blockingMessage || customer.status === "PASSIVE"}
          onClick={() => void passivate()}
          type="button"
        >
          Pasife Al
        </button>}
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
  fieldPrefix,
  registerFieldElement,
  value,
  onChange,
}: {
  title: string;
  fieldPrefix: "billingAddress" | "shippingAddress";
  registerFieldElement: (fieldId: string, element: HTMLInputElement | null) => void;
  value: CustomerEditAddress;
  onChange: (key: keyof CustomerEditAddress, v: string) => void;
}) {
  return (
    <GlassCard className="p-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <Field className="md:col-span-2" label="Adres Satiri">
          <input className={inputClass} ref={(element) => registerFieldElement(`customer.${fieldPrefix}.line1`, element)} onChange={(e) => onChange("line1", e.target.value)} value={value.line1} />
        </Field>
        <Field label="Ilce">
          <input className={inputClass} ref={(element) => registerFieldElement(`customer.${fieldPrefix}.district`, element)} onChange={(e) => onChange("district", e.target.value)} value={value.district} />
        </Field>
        <Field label="Il">
          <input className={inputClass} ref={(element) => registerFieldElement(`customer.${fieldPrefix}.city`, element)} onChange={(e) => onChange("city", e.target.value)} value={value.city} />
        </Field>
        <Field label="Posta Kodu">
          <input className={inputClass} ref={(element) => registerFieldElement(`customer.${fieldPrefix}.postalCode`, element)} onChange={(e) => onChange("postalCode", e.target.value)} value={value.postalCode} />
        </Field>
        <Field label="Ulke">
          <input className={inputClass} ref={(element) => registerFieldElement(`customer.${fieldPrefix}.country`, element)} onChange={(e) => onChange("country", e.target.value)} value={value.country} />
        </Field>
      </div>
    </GlassCard>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";

function readEditField(values: unknown, field: ModuleFieldDefinition): unknown { if (typeof values !== "object" || values === null) return undefined; if (field.custom) return (values as CustomerEditFieldValues).customFields.find((item) => `customer.custom.${item.definitionId}` === field.fieldId)?.value; let current: unknown = values; for (const part of field.key.split(".")) current = typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined; return current; }
function editFieldPayload(values: unknown, field: ModuleFieldDefinition, value: unknown): { fieldName: string; value: unknown } { if (field.custom) { const current = typeof values === "object" && values !== null ? (values as CustomerEditFieldValues).customFields : []; const definitionId = field.fieldId.replace("customer.custom.", ""); return { fieldName: "customFields", value: [...current.filter((item) => item.definitionId !== definitionId), ...(value === undefined ? [] : [{ definitionId, value }])] }; } const [root, ...path] = field.key.split("."); if (!path.length) return { fieldName: root, value }; const currentRoot = typeof values === "object" && values !== null ? (values as Record<string, unknown>)[root] : undefined; return { fieldName: root, value: { ...(typeof currentRoot === "object" && currentRoot !== null ? currentRoot : {}), [path.join(".")]: value } }; }
function editTabForField(field: ModuleFieldDefinition): TabId { if (field.custom || field.uiSection === "Finansal / Ticari Koşullar") return "financial"; if (field.uiSection === "Adres Bilgileri") return "address"; if (field.uiSection === "Resmi Bilgiler") return "official"; if (field.uiSection === "Sistem Ayarları") return "system"; return "identity"; }
function editTabForSection(section: string): TabId { if (section === "Finansal / Ticari Koşullar" || section === "Özel Alanlar") return "financial"; if (section === "Adres Bilgileri") return "address"; if (section === "Resmi Bilgiler") return "official"; if (section === "Sistem Ayarları") return "system"; return "identity"; }
