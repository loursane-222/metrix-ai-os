"use client";

import { useEffect, useState } from "react";
import { CustomersBottomNav } from "@/components/customers/CustomersBottomNav";
import { PAGE_BACKGROUND } from "@/components/customers/ui";

type Overview = {
  organization: { name: string };
  profile: Record<string, unknown> & { updatedAt?: string; brandName?: string; shortName?: string; industry?: string; description?: string; baseCurrency?: string };
  indicators: { profileReadiness: number; activeGoals: number; openManagementIssues: number; connectedDataSources: number; pendingCandidates: number };
  units: Array<{ id: string; name: string; unitType: string; city?: string; isPrimary: boolean }>;
  goals: Array<{ id: string; title: string; targetValue: string | null; actualValue: string | null; currency: string }>;
  assets: Array<{ id: string; name: string; assetType: string; currentBookValue: string | null; currency: string }>;
  dataSources: Array<{ id: string; provider: string; connectionStatus: string }>;
  reports: Array<{ id: string; status: string; dueDate: string }>;
  financial: { managementView: Record<string, { value: number | null; status: string; currency: string }> };
};

const NAV = ["Genel Bakış", "Kimlik ve İletişim", "Adresler ve Birimler", "Resmî Bilgiler", "İş Modeli", "Finansal Ayarlar", "Hedefler", "Varlıklar", "Haftalık Raporlar", "Entegrasyonlar", "Sistem Bilgileri"];

function money(metric?: { value: number | null; currency: string }) {
  if (!metric || metric.value === null) return "Veri yok";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: metric.currency, maximumFractionDigits: 0 }).format(metric.value);
}

export function CompanyOperatingScreen() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState("Genel Bakış");
  useEffect(() => {
    fetch("/api/company", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Şirket verisi okunamadı.");
        setData(payload.data ?? payload);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  if (error) return <State text={error} />;
  if (!data) return <State text="Şirket gerçekliği hazırlanıyor…" />;
  const profileName = data.profile.shortName || data.profile.brandName || data.organization.name;
  const financial = data.financial.managementView;
  return (
    <main className="min-h-dvh text-[#f4f7f8] [color-scheme:dark]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-[1180px] px-4 pb-32 pt-[max(24px,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] border border-[#34e6cf]/25 bg-[#34e6cf]/10 text-xl font-bold text-[#34e6cf]">{String(profileName).slice(0, 2).toLocaleUpperCase("tr-TR")}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#34e6cf]">Şirketim · Canonical Company Reality</p>
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{String(profileName)}</h1>
            <p className="mt-1 truncate text-sm text-[#93a0ad]">{data.profile.industry || data.profile.description || "Faaliyet alanı henüz doğrulanmadı"}</p>
          </div>
          <div className="hidden text-right text-xs text-[#6f7a87] sm:block">Son güncelleme<br/><span className="text-[#c5ccd2]">{data.profile.updatedAt ? new Date(data.profile.updatedAt).toLocaleDateString("tr-TR") : "—"}</span></div>
        </header>

        <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Profil Hazırlığı", `%${data.indicators.profileReadiness}`, "cyan"],
            ["Aktif Hedefler", data.indicators.activeGoals, "blue"],
            ["Açık Yönetim Konuları", data.indicators.openManagementIssues, "amber"],
            ["Bağlı Veri Kaynakları", data.indicators.connectedDataSources, "green"],
          ].map(([label, value, tone]) => <Kpi key={String(label)} label={String(label)} value={String(value)} tone={String(tone)} />)}
        </section>

        <nav className="mt-6 hidden gap-1 overflow-x-auto rounded-2xl border border-white/[.07] bg-white/[.025] p-1 lg:flex">
          {NAV.map((item) => <button className={`shrink-0 rounded-xl px-3 py-2 text-xs ${active === item ? "bg-[#34e6cf]/15 font-semibold text-[#34e6cf]" : "text-[#77838e] hover:text-white"}`} key={item} onClick={() => setActive(item)}>{item}</button>)}
        </nav>
        <select aria-label="Şirketim bölümü" className="mt-6 w-full rounded-2xl border border-white/10 bg-[#0a1821] px-4 py-3 text-sm lg:hidden" onChange={(event) => setActive(event.target.value)} value={active}>{NAV.map((item) => <option key={item}>{item}</option>)}</select>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <section className="rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#34e6cf]">METRIX Yönetim Özeti</p>
            <h2 className="mt-3 text-xl font-semibold">{active}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#93a0ad]">
              {data.indicators.profileReadiness < 70 ? "Şirket bağlamının güvenilir yönetim değerlendirmesi için bazı kurucu bilgiler eksik." : "Şirket profili yönetim değerlendirmesi için kullanılabilir durumda."}
              {data.indicators.pendingCandidates ? ` ${data.indicators.pendingCandidates} değişiklik doğrulama bekliyor.` : " Doğrulama bekleyen değişiklik yok."}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Info title="Dönem ana odağı" value={data.goals[0]?.title ?? "Aktif şirket hedefi tanımlanmadı"} />
              <Info title="Kritik bilgi eksikleri" value={data.indicators.profileReadiness < 100 ? `Profil %${100 - data.indicators.profileReadiness} eksik` : "Kritik eksik yok"} warning={data.indicators.profileReadiness < 70} />
              <Info title="Doğrulama bekleyen" value={`${data.indicators.pendingCandidates} Business Candidate`} warning={data.indicators.pendingCandidates > 0} />
              <Info title="Resmî yükümlülükler" value="Doğrulanmış belge/vade kaydı yok" />
            </div>
          </section>

          <section className="rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#7fa4ff]">Finansal Yönetim Görünümü</p>
            <div className="mt-4 space-y-3">
              <Metric label="Faaliyet giderleri" value={money(financial.operatingExpenses)} available={financial.operatingExpenses?.value !== null} />
              <Metric label="Toplam alacak" value={money(financial.totalReceivables)} available={financial.totalReceivables?.value !== null} />
              <Metric label="Geciken alacak" value={money(financial.overdueReceivables)} available={financial.overdueReceivables?.value !== null} />
              <Metric label="Tahmini net sonuç" value={money(financial.estimatedNetResult)} available={false} />
            </div>
            <p className="mt-4 text-[10px] leading-4 text-[#5f6b75]">Muhasebe sonucu değildir. Yalnız canonical Expense ve Payment kayıtlarından deterministik üretilir; eksik veri tahmin edilmez.</p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Summary title="Adresler ve Birimler" value={`${data.units.length} aktif birim`} empty="Merkez veya operasyon birimi eklenmedi." />
          <Summary title="Varlıklar" value={`${data.assets.length} doğrulanmış varlık`} empty="Canonical varlık kaydı yok." />
          <Summary title="Haftalık Raporlar" value={`${data.reports.filter((x) => x.status === "SUBMITTED").length} gönderim`} empty="Henüz rapor ataması yok." />
        </div>
      </div>
      <CustomersBottomNav />
    </main>
  );
}

function State({ text }: { text: string }) { return <main className="grid min-h-dvh place-items-center text-sm text-[#93a0ad]" style={{ background: PAGE_BACKGROUND }}>{text}</main>; }
function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) { const colors: Record<string, string> = { cyan: "text-[#34e6cf]", blue: "text-[#7fa4ff]", amber: "text-[#ffb066]", green: "text-[#3ddc97]" }; return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4"><p className={`text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[11px] font-medium text-[#93a0ad]">{label}</p></div>; }
function Info({ title, value, warning = false }: { title: string; value: string; warning?: boolean }) { return <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4"><p className="text-[10px] uppercase tracking-wider text-[#697681]">{title}</p><p className={`mt-2 text-sm font-medium ${warning ? "text-[#ffb066]" : "text-[#dce2e6]"}`}>{value}</p></div>; }
function Metric({ label, value, available }: { label: string; value: string; available: boolean }) { return <div className="flex items-center justify-between border-b border-white/[.06] pb-3 text-sm"><span className="text-[#8e9aa4]">{label}</span><span className={available ? "font-semibold text-white" : "text-[#ffb066]"}>{value}</span></div>; }
function Summary({ title, value, empty }: { title: string; value: string; empty: string }) { const isEmpty = value.startsWith("0 "); return <section className="rounded-[24px] border border-white/[.07] bg-white/[.03] p-5"><h3 className="text-sm font-semibold">{title}</h3><p className={`mt-4 text-sm ${isEmpty ? "text-[#6d7882]" : "text-[#34e6cf]"}`}>{isEmpty ? empty : value}</p></section>; }
