"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { buildCustomerRoute } from "@/lib/customers/customer-navigation";
import { useCustomerCreateSurfaceRuntime } from "@/lib/customers/use-customer-create-surface-runtime";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { PrimaryButton } from "./ui";
import { CustomerAuthorityForm } from "./CustomerAuthorityForm";
import { listCustomerFieldDefinitions } from "@/lib/customers/customers-client";
import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";

export function CustomerCreateScreen() {
  const router = useRouter();
  const { state, execute } = useCustomerCreateSurfaceRuntime();
  const form = state.draft;
  const [customFields, setCustomFields] = useState<ModuleFieldDefinition[]>([]);
  useEffect(() => { void listCustomerFieldDefinitions().then((result) => { if (result.ok) setCustomFields(result.data.fields); }); }, []);

  function set(key: string, value: unknown) {
    void execute({ type: "set_field", field: key as never, value });
  }

  async function save() {
    const outcome = await execute({ type: "commit" });
    if (outcome.navigation) router.replace(buildCustomerRoute(outcome.navigation));
  }

  return (
    <PageHeaderShell>
      <CustomerAuthorityForm customFields={customFields} onChange={set} value={form} />

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
