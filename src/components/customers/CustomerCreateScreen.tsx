"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { buildCustomerRoute } from "@/lib/customers/customer-navigation";
import { useCustomerCreateSurfaceRuntime } from "@/lib/customers/use-customer-create-surface-runtime";
import { CustomersBottomNav } from "./CustomersBottomNav";
import { IconChevronLeft } from "./icons";
import { GlassCard, PrimaryButton, SectionTitle } from "./ui";

export function CustomerCreateScreen() {
  const router = useRouter();
  const { state, execute } = useCustomerCreateSurfaceRuntime();
  const form = state.draft;

  function set(key: keyof typeof form, value: string) {
    void execute({ type: "set_field", field: key, value });
  }

  async function save() {
    const outcome = await execute({ type: "commit" });
    if (outcome.navigation) router.replace(buildCustomerRoute(outcome.navigation));
  }

  return (
    <PageHeaderShell>
      <GlassCard className="mt-4 p-4">
        <SectionTitle>Yeni Musteri</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Field className="md:col-span-2" label="Firma Adi *">
            <input
              className={inputClass}
              onChange={(e) => set("displayName", e.target.value)}
              value={form.displayName}
            />
          </Field>
          <Field className="md:col-span-2" label="Ticari Unvan">
            <input className={inputClass} onChange={(e) => set("legalName", e.target.value)} value={form.legalName} />
          </Field>
          <Field label="Telefon">
            <input className={inputClass} onChange={(e) => set("phone", e.target.value)} value={form.phone} />
          </Field>
          <Field label="E-posta">
            <input className={inputClass} onChange={(e) => set("email", e.target.value)} type="email" value={form.email} />
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

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-xs font-medium text-[#8b95a3]">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-[#f4f7f8] outline-none focus:border-[#34e6cf]/40";
