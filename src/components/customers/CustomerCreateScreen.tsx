"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCustomerRoute } from "@/lib/customers/customer-navigation";
import { useCustomerCreateSurfaceRuntime } from "@/lib/customers/use-customer-create-surface-runtime";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { PrimaryButton } from "./ui";
import { CustomerAuthorityForm } from "./CustomerAuthorityForm";
import { listCustomerFieldDefinitions } from "@/lib/customers/customers-client";
import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";
import { CustomerDocumentIngestionPanel } from "./CustomerDocumentIngestionPanel";
import { useUniversalInputRegistrations, type UniversalRegistrationInput } from "@/components/input-authority";
import { CUSTOMER_BUILT_IN_FIELDS, CUSTOMER_FIELD_SECTIONS } from "@/lib/customers/customer-field-registry";
import { customerAuthorityKey, customerFieldDescriptor, customerSectionTargetId, customerTargetId } from "@/lib/customers/customer-universal-input-adapter";

export function CustomerCreateScreen() {
  const router = useRouter();
  const { state, execute } = useCustomerCreateSurfaceRuntime();
  const form = state.draft;
  const [customFields, setCustomFields] = useState<ModuleFieldDefinition[]>([]);
  const fieldElements = useRef(new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>());
  const registerFieldElement = useCallback((fieldId: string, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => { if (element) fieldElements.current.set(fieldId, element); else fieldElements.current.delete(fieldId); }, []);
  useEffect(() => { let active = true; const refresh = () => void listCustomerFieldDefinitions().then((result) => { if (active && result.ok) setCustomFields(result.data.fields); }); refresh(); window.addEventListener("customer-field-registry-changed", refresh); return () => { active = false; window.removeEventListener("customer-field-registry-changed", refresh); }; }, []);

  function set(key: string, value: unknown) {
    void execute({ type: "set_field", field: key as never, value });
  }

  const universalRegistrations = useMemo<readonly UniversalRegistrationInput[]>(() => {
    const fields = [...CUSTOMER_BUILT_IN_FIELDS, ...customFields];
    const surfaceId = customerTargetId("create", "surface", "form");
    const pageId = customerTargetId("create", "page", "customers");
    const workspaceId = customerTargetId("create", "surface", "workspace");
    return [
      { descriptor: { executiveTargetId: pageId, authorityKey: "customers.create.page", targetKind: "page", surfaceType: "page", module: "customers", entityType: "customer", label: "Yeni müşteri", readable: true, visibility: "visible", active: true, mounted: true, rootPageId: pageId, order: 0 }, adapter: {} },
      { descriptor: { executiveTargetId: workspaceId, authorityKey: "customers.create.workspace", targetKind: "surface", surfaceType: "create", module: "customers", entityType: "customer", label: "Müşteri oluşturma çalışma alanı", parentTargetId: pageId, parentSurfaceId: pageId, rootPageId: pageId, visibility: "visible", active: true, mounted: true, focusScope: true, order: 1 }, adapter: {} },
      { descriptor: { executiveTargetId: surfaceId, authorityKey: "customers.customer.create", targetKind: "surface", surfaceType: "form", module: "customers", entityType: "customer", label: "Müşteri oluşturma formu", parentTargetId: workspaceId, parentSurfaceId: workspaceId, rootPageId: pageId, readable: true, mutable: true, supportsDraft: false, visibility: "visible", active: true, mounted: true, order: 2 }, adapter: { validate: () => ({ valid: state.draft.displayName.trim().length > 0, missing: !state.draft.displayName.trim(), message: "Firma adı gerekli." }), commit: () => execute({ type: "commit" }), cancel: () => undefined } },
      ...CUSTOMER_FIELD_SECTIONS.filter((section) => fields.some((field) => field.uiSection === section)).map((section, index): UniversalRegistrationInput => ({ descriptor: { executiveTargetId: customerSectionTargetId("create", section), authorityKey: `customers.create.section.${index}`, targetKind: "section", surfaceType: "section", module: "customers", entityType: "customer", label: section, parentTargetId: surfaceId, parentSurfaceId: surfaceId, rootPageId: pageId, visibility: "visible", active: true, mounted: true, expanded: true, expandable: true, collapsible: true, order: 10 + index }, adapter: {} })),
      ...fields.map((field): UniversalRegistrationInput => ({ descriptor: customerFieldDescriptor(field, "create"), adapter: { read: () => readPath(state.draft, field), ...(field.writable ? { set: (value: unknown) => execute({ type: "set_field", field: field.key as never, value }), clear: () => execute({ type: "clear_field", field: field.key as never }), focus: () => fieldElements.current.get(field.fieldId)?.focus(), reveal: () => fieldElements.current.get(field.fieldId)?.scrollIntoView({ block: "center" }), validate: () => validateCustomerField(field, readPath(state.draft, field)) } : {}) } })),
      { descriptor: { executiveTargetId: customerTargetId("create", "action", "commit"), authorityKey: customerAuthorityKey("commit"), targetKind: "action", module: "customers", entityType: "customer", label: "Müşteri oluştur", parentTargetId: surfaceId, actionName: "customer.create", commitActionName: "customer.create", mutable: true, supportsDraft: false, order: 10000 }, adapter: { commit: () => execute({ type: "commit" }) } },
      { descriptor: { executiveTargetId: customerTargetId("create", "action", "cancel"), authorityKey: customerAuthorityKey("cancel"), targetKind: "action", module: "customers", entityType: "customer", label: "Oluşturmayı iptal et", parentTargetId: surfaceId, actionName: "surface.cancel", mutable: true, order: 10001 }, adapter: { cancel: () => undefined } },
    ];
  }, [customFields, execute, state.draft]);
  useUniversalInputRegistrations(universalRegistrations);

  async function save() {
    const outcome = await execute({ type: "commit" });
    if (outcome.navigation) router.replace(buildCustomerRoute(outcome.navigation));
  }

  return (
    <PageHeaderShell>
      <CustomerDocumentIngestionPanel customFields={customFields} onApply={set} />
      <CustomerAuthorityForm customFields={customFields} onChange={set} registerFieldElement={registerFieldElement} value={form} />

      <div className="sticky bottom-24 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl">
        <p className="flex-1 text-center text-[10px] text-[#5c6673]">
          {state.error ?? "Kaydetmek icin firma adini girin."}
        </p>
        <PrimaryButton disabled={state.submitting} onClick={() => void save()}>
          {state.submitting ? "Kaydediliyor..." : "Olustur"}
        </PrimaryButton>
      </div>
    </PageHeaderShell>
  );
}

function readPath(value: object, field: ModuleFieldDefinition): unknown { if (field.custom) return (value as { customFields?: Array<{ definitionId: string; value: unknown }> }).customFields?.find((item) => `customer.custom.${item.definitionId}` === field.fieldId)?.value; let current: unknown = value; for (const part of field.key.split(".")) current = typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined; return current; }
function validateCustomerField(field: ModuleFieldDefinition, value: unknown) { const missing = field.requiredOnCreate && (value === undefined || value === null || value === ""); return { valid: !missing, missing, ...(missing ? { message: `${field.label} gerekli.` } : {}) }; }

// Same viewport-fixed + inner-scroll shell as CustomerEditScreen's PageHeaderShell:
// the outer container never scrolls, only the region below the header does, so
// the fixed Executive Dock never covers the form content or the submit footer.
function PageHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-[#0a0d12] text-[#f4f7f8] [color-scheme:dark]">
      <div
        className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 md:max-w-3xl md:px-8"
        style={{ paddingTop: "calc(20px + env(safe-area-inset-top))" }}
      >
        <header className="flex shrink-0 items-center justify-between py-1">
          <Link
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3e8eb]"
            href="/metrix/customers"
          >
            <IconChevronLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-[#f4f7f8]">Yeni Musteri</p>
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
