"use client";
import { useEffect } from "react";
import { universalInputRegistry } from "@/lib/input-authority";

const COPY = {
  accounting: ["Muhasebe", "Muhasebe için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  collections: ["Tahsilatlar", "Tahsilatlar için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  "company-dna": ["Şirket DNA", "Şirket DNA için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  "daily-rhythm": ["Günlük Ritim", "Günlük ritim için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  documents: ["Belgeler", "Belgeler için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  finance: ["Finans", "Finans için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  goals: ["Hedefler", "Hedefler için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  opinion: ["METRIX Görüşü", "Bu yüzey için doğrulanmış canonical veri bağlantısı henüz hazır değil."],
  reports: ["Raporlar", "Raporlar için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  sales: ["Satış", "Satış için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  suppliers: ["Tedarikçiler", "Tedarikçiler için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  tasks: ["Görevler", "Görevler için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  team: ["Ekip", "Ekip için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  templates: ["Şablonlar", "Şablonlar için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
  "work-plan": ["İş Planı", "İş planı için doğrulanmış canonical veri yüzeyi henüz bağlı değil."],
} as const;

export type UnavailableBusinessSurfaceId = keyof typeof COPY;

export function UnavailableBusinessSurface({ surface }: { surface: UnavailableBusinessSurfaceId }) {
  const [title, description] = COPY[surface];
  useEffect(() => { const registration = universalInputRegistry.register({ descriptor: { executiveTargetId: `${surface}-unavailable-page`, authorityKey: `${surface}.list.page`, targetKind: "page", module: surface, label: title, readable: true, visibility: "visible", active: true, mounted: true }, adapter: {} }); return () => { universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); }; }, [surface, title]);
  return (
    <main className="grid h-full min-h-0 place-items-center overflow-y-auto overscroll-contain px-4 py-8 sm:px-8">
      <section className="w-full max-w-2xl rounded-[28px] border border-white/[.08] bg-white/[.035] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#C9BFA8]">Canonical çalışma yüzeyi</p>
        <h1 className="mt-3 text-2xl font-bold text-[#f4f7f8]">{title}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#9ba8b2]">{description}</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#73818b]">METRIX bu alanda demo kayıt, sahte KPI veya tarayıcı belleğini kurumsal gerçek olarak göstermiyor.</p>
      </section>
    </main>
  );
}
