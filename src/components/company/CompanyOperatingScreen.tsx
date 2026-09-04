"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAGE_BACKGROUND } from "@/components/customers/ui";
import { universalInputRegistry } from "@/lib/input-authority";
import { registerCompanyProfileEditSurfaceTarget, unregisterCompanyProfileEditSurfaceTarget } from "@/lib/company/company-profile-edit-surface-command-channel";
import { registerCompanyProfileCandidateSurfaceTarget, unregisterCompanyProfileCandidateSurfaceTarget } from "@/lib/company/company-profile-candidate-surface-command-channel";
import { registerCompanyUnitActionSurfaceTarget, unregisterCompanyUnitActionSurfaceTarget } from "@/lib/company/company-unit-action-surface-command-channel";
import { registerCompanyUnitFormSurfaceTarget, unregisterCompanyUnitFormSurfaceTarget } from "@/lib/company/company-unit-form-surface-command-channel";
import { registerCompanyGoalCreateSurfaceTarget, unregisterCompanyGoalCreateSurfaceTarget } from "@/lib/company/company-goal-create-surface-command-channel";
import { registerCompanyAssetCreateSurfaceTarget, unregisterCompanyAssetCreateSurfaceTarget } from "@/lib/company/company-asset-create-surface-command-channel";
import { registerCompanySourceCreateSurfaceTarget, unregisterCompanySourceCreateSurfaceTarget } from "@/lib/company/company-source-create-surface-command-channel";
import type { CompanyProfileEditFieldName } from "@/lib/company/company-profile-edit-command-contract";
import type { CompanyProfileCandidateFieldName } from "@/lib/company/company-profile-candidate-command-contract";
import type { CompanyUnitFormFieldName } from "@/lib/company/company-unit-form-command-contract";
import type { CompanyGoalCreateFieldName } from "@/lib/company/company-goal-create-command-contract";
import type { CompanyAssetCreateFieldName } from "@/lib/company/company-asset-create-command-contract";
import type { CompanySourceCreateFieldName } from "@/lib/company/company-source-create-command-contract";

type Json = Record<string, unknown>;
type Overview = {
  organization: { id: string; name: string };
  profile: Json & { updatedAt?: string; brandName?: string; shortName?: string; industry?: string; description?: string; baseCurrency?: string };
  indicators: { profileReadiness: number; activeGoals: number; openManagementIssues: number; connectedDataSources: number; pendingCandidates: number };
  units: Array<Json & { id: string; name: string; unitType: string; city?: string; isPrimary: boolean; active?: boolean }>;
  goals: Array<Json & { id: string; title: string; targetValue: string | null; actualValue: string | null; currency: string }>;
  assets: Array<Json & { id: string; name: string; assetType: string; currentBookValue: string | null; currency: string }>;
  dataSources: Array<Json & { id: string; provider: string; connectionStatus: string }>;
  reports: Array<Json & { id: string; status: string; dueDate: string }>;
  financial: { managementView: Record<string, { value: number | null; status: string; currency: string }> };
  companyModel: { businessOverview: BusinessOverview } | null;
};
type AccountingMetric = { amounts: Array<{ currency: string; amount: number }>; available: boolean; note: string };
type BusinessOverviewSignal = { code: string; domain: string; severity: string; title: string; detail: string };
type BusinessOverviewGoal = { goalId: string; title: string; metric: string; targetAmount: number | null; actualAmount: number | null; currency: string; progressRatio: number | null; status: "ON_TRACK" | "AT_RISK" | "BEHIND" | "UNKNOWN" };
type BusinessOverview = {
  generatedAt: string;
  financialSummary: { cashPosition: AccountingMetric; monthlyRevenue: AccountingMetric; monthlyExpense: AccountingMetric; totalReceivable: AccountingMetric; totalPayable: AccountingMetric };
  financialHealthLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  financialExecutiveSummary: string;
  goals: BusinessOverviewGoal[];
  capacity: { activeProductionOrderCount: number; totalPlanned: number; totalProduced: number; utilizationRatio: number | null; lateOrderCount: number };
  activeRisks: BusinessOverviewSignal[];
  activeOpportunities: BusinessOverviewSignal[];
};
type Candidate = { id: string; targetDomain: string; status: string; changes: Array<{ id: string; fieldPath: string; proposedValue: unknown }> };
type MemoryCandidate = { id: string; proposedType: string; proposedKey: string; proposedValue: string; source: string; confidence: number; reason: string; createdAt: string };
type ReportOverview = { templates: Array<Json & { id: string; name: string; versions: Array<Json & { version: number }>; assignments: Array<Json> }>; members: Array<{ userId: string; label: string; role: string }>; summary: Record<string, number> };
type FieldDefinition = Json & { id: string; label: string; key: string; valueType: string; unit?: string; active: boolean; riskLevel?: string; approvalPolicy?: string };

const NAV = ["Genel Bakış", "Kimlik ve İletişim", "Adresler ve Birimler", "Resmî Bilgiler", "İş Modeli", "Finansal Ayarlar", "Hedefler", "Varlıklar", "Haftalık Raporlar", "Entegrasyonlar", "Öğrenilen Bilgiler", "Sistem Bilgileri"];
const PROFILE_FIELDS: Record<string, Array<[string, string, string?]>> = {
  "Kimlik ve İletişim": [["brandName", "Marka adı"], ["legalName", "Ticari unvan"], ["shortName", "Kısa ad"], ["companyType", "Şirket türü"], ["foundedAt", "Kuruluş tarihi (ISO)"], ["country", "Ülke"], ["city", "Şehir"], ["primaryLanguage", "Ana dil"], ["website", "Web sitesi"], ["phone", "Telefon"], ["email", "E-posta"], ["logoRef", "Logo referansı"], ["description", "Açıklama", "textarea"]],
  "İş Modeli": [["industry", "Sektör"], ["subIndustry", "Alt sektör"], ["activityAreasJson", "Faaliyet alanları"], ["revenueModelJson", "Gelir modeli"], ["salesChannelsJson", "Satış kanalları"], ["customerTypesJson", "Müşteri türleri"], ["servedRegionsJson", "Hizmet verilen bölgeler"], ["seasonality", "Mevsimsellik"], ["supplyStructure", "Tedarik yapısı"], ["managementContext", "Temel yönetim bağlamı", "textarea"]],
};
const OFFICIAL_FIELDS: Array<[string, string]> = [["taxOffice", "Vergi dairesi"], ["taxNumber", "Vergi numarası"], ["mersisNo", "MERSİS"], ["tradeRegistryNo", "Ticaret sicil"], ["chamberRegistration", "Oda kaydı"], ["kepAddress", "KEP adresi"], ["eInvoiceEnabled", "E-fatura durumu (true/false)"], ["eArchiveEnabled", "E-arşiv durumu (true/false)"], ["authorizedRepresentativesJson", "Yetkili temsilciler"], ["officialDocumentsJson", "Belge ve geçerlilik referansları"]];
const FINANCIAL_FIELDS: Array<[string, string]> = [["baseCurrency", "Ana para birimi"], ["currenciesJson", "Kullanılan para birimleri"], ["fiscalYearStartMonth", "Mali yıl başlangıç ayı"], ["defaultPaymentTerms", "Varsayılan ödeme koşulları"], ["standardMaturityDays", "Standart vade"], ["discountPolicy", "İskonto yaklaşımı"], ["creditRiskPolicy", "Kredi/risk politikası"], ["profitabilityPolicy", "Hedef kârlılık"], ["budgetPeriod", "Bütçe periyodu"]];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "İşlem tamamlanamadı.");
  return payload.data ?? payload;
}

export function CompanyOperatingScreen({ onReady }: { onReady?: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [active, setActive] = useState("Genel Bakış");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { const registration = universalInputRegistry.register({ descriptor: { executiveTargetId: "company-operating-page", authorityKey: "company.operating.page", targetKind: "page", module: "company", label: "Şirketim", readable: true, visibility: "visible", active: true, mounted: true }, adapter: {} }); return () => { universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); }; }, []);
  const load = useCallback(async () => { try { setData(await api("/api/company")); setError(null); onReady?.(); } catch (reason) { setError((reason as Error).message); } }, [onReady]);
  useEffect(() => { void load(); }, [load]);
  const complete = async (message: string) => { setNotice(message); await load(); window.setTimeout(() => setNotice(null), 3500); };
  if (error && !data) return <State text={error} />;
  if (!data) return <State text="Şirket gerçekliği hazırlanıyor…" />;
  const profileName = data.profile.shortName || data.profile.brandName || data.organization.name;
  return (
    <main className="min-h-full overflow-x-hidden text-[#f4f7f8] [color-scheme:dark]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-[1180px] px-4 pb-8 pt-6 sm:px-6">
        <header className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] border border-[#34e6cf]/25 bg-[#34e6cf]/10 text-xl font-bold text-[#34e6cf]">{String(profileName).slice(0, 2).toLocaleUpperCase("tr-TR")}</div>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#34e6cf]">Şirketim · Canonical Company Reality</p><h1 className="truncate text-2xl font-bold sm:text-3xl">{String(profileName)}</h1><p className="mt-1 truncate text-sm text-[#93a0ad]">{data.profile.industry || data.profile.description || "Faaliyet alanı henüz doğrulanmadı"}</p></div>
          <div className="hidden text-right text-xs text-[#6f7a87] sm:block">Son güncelleme<br/><span className="text-[#c5ccd2]">{data.profile.updatedAt ? new Date(data.profile.updatedAt).toLocaleDateString("tr-TR") : "—"}</span></div>
        </header>
        <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Profil Hazırlığı" value={`%${data.indicators.profileReadiness}`} tone="cyan"/><Kpi label="Aktif Hedefler" value={String(data.indicators.activeGoals)} tone="blue"/><Kpi label="Açık Yönetim Konuları" value={String(data.indicators.openManagementIssues)} tone="amber"/><Kpi label="Bağlı Veri Kaynakları" value={String(data.indicators.connectedDataSources)} tone="green"/>
        </section>
        <nav className="mt-6 hidden gap-1 overflow-x-auto rounded-2xl border border-white/[.07] bg-white/[.025] p-1 lg:flex">{NAV.map((item) => <button className={`shrink-0 rounded-xl px-3 py-2 text-xs ${active === item ? "bg-[#34e6cf]/15 font-semibold text-[#34e6cf]" : "text-[#77838e] hover:text-white"}`} key={item} onClick={() => setActive(item)}>{item}</button>)}</nav>
        <select aria-label="Şirketim bölümü" className="mt-6 w-full rounded-2xl border border-white/10 bg-[#0a1821] px-4 py-3 text-sm lg:hidden" onChange={(event) => setActive(event.target.value)} value={active}>{NAV.map((item) => <option key={item}>{item}</option>)}</select>
        {notice ? <div role="status" className="mt-4 rounded-2xl border border-[#3ddc97]/25 bg-[#3ddc97]/10 px-4 py-3 text-sm text-[#3ddc97]">{notice}</div> : null}
        {error ? <div role="alert" className="mt-4 rounded-2xl border border-[#f16a7a]/25 bg-[#f16a7a]/10 px-4 py-3 text-sm text-[#f16a7a]">{error}</div> : null}
        <section className="mt-5 rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
          <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#34e6cf]">Production Company Domain</p><h2 className="mt-2 text-xl font-semibold">{active}</h2></div>
          {active === "Genel Bakış" ? <OverviewPanel data={data}/> : null}
          {PROFILE_FIELDS[active] ? <ProfileForm fields={PROFILE_FIELDS[active]!} profile={data.profile} activeTab={active} onComplete={complete}/> : null}
          {active === "Resmî Bilgiler" ? <CandidateProfileForm fields={OFFICIAL_FIELDS} profile={data.profile} title="Resmî değişiklik" activeTab={active} onComplete={complete}/> : null}
          {active === "Finansal Ayarlar" ? <CandidateProfileForm fields={FINANCIAL_FIELDS} profile={data.profile} title="Finansal politika değişikliği" activeTab={active} onComplete={complete}/> : null}
          {active === "Adresler ve Birimler" ? <UnitsPanel units={data.units} onComplete={complete}/> : null}
          {active === "Hedefler" ? <GoalsPanel goals={data.goals} onComplete={complete}/> : null}
          {active === "Varlıklar" ? <AssetsPanel assets={data.assets} onComplete={complete}/> : null}
          {active === "Entegrasyonlar" ? <><BizimHesapPanel onComplete={complete}/><IcloudPanel onComplete={complete}/><SourcesPanel sources={data.dataSources} onComplete={complete}/></> : null}
          {active === "Haftalık Raporlar" ? <ReportsPanel onComplete={complete}/> : null}
          {active === "Öğrenilen Bilgiler" ? <MemoryCandidatePanel onComplete={complete}/> : null}
          {active === "Sistem Bilgileri" ? <SystemPanel onComplete={complete}/> : null}
        </section>
      </div>
    </main>
  );
}

function OverviewPanel({ data }: { data: Overview }) {
  const f = data.financial.managementView;
  const overview = data.companyModel?.businessOverview ?? null;
  return <div className="grid gap-4 lg:grid-cols-2"><Card title="METRIX Yönetim Özeti"><p className="text-sm leading-6 text-[#93a0ad]">{data.indicators.profileReadiness < 70 ? "Canonical profil kritik bilgiler bakımından eksik." : "Canonical profil yönetim değerlendirmesine hazır."} {data.indicators.pendingCandidates ? `${data.indicators.pendingCandidates} değişiklik doğrulama bekliyor.` : "Bekleyen doğrulama yok."}</p><div className="mt-4 grid grid-cols-2 gap-3"><Info title="Dönem odağı" value={data.goals[0]?.title ?? "Hedef tanımlanmadı"}/><Info title="Aktif birimler" value={String(data.units.length)}/><Info title="Varlıklar" value={String(data.assets.length)}/><Info title="Rapor gönderimleri" value={String(data.reports.filter((x) => x.status === "SUBMITTED").length)}/></div></Card><Card title="Finansal Yönetim Görünümü"><Metric label="Faaliyet giderleri" metric={f.operatingExpenses}/><Metric label="Toplam alacak" metric={f.totalReceivables}/><Metric label="Geciken alacak" metric={f.overdueReceivables}/><Metric label="Tahmini net sonuç" metric={f.estimatedNetResult}/><p className="mt-4 text-[10px] text-[#68747e]">Yalnız canonical Expense ve Payment kayıtları. Eksik veri tahmin edilmez.</p></Card>{overview ? <BusinessOverviewCard overview={overview}/> : null}</div>;
}

const HEALTH_LABEL: Record<string, string> = { LOW: "Sağlıklı", MEDIUM: "İzleme gerektiriyor", HIGH: "Yüksek risk", CRITICAL: "Kritik" };
const HEALTH_TONE: Record<string, string> = { LOW: "text-[#3ddc97]", MEDIUM: "text-[#ffb066]", HIGH: "text-[#f16a7a]", CRITICAL: "text-[#f16a7a]" };
const GOAL_STATUS_LABEL: Record<string, string> = { ON_TRACK: "Hedefte", AT_RISK: "Riskli", BEHIND: "Geride", UNKNOWN: "Belirsiz" };
const GOAL_STATUS_TONE: Record<string, string> = { ON_TRACK: "text-[#3ddc97]", AT_RISK: "text-[#ffb066]", BEHIND: "text-[#f16a7a]", UNKNOWN: "text-[#697681]" };

function formatMetricAmounts(metric: AccountingMetric): string {
  if (!metric.available || metric.amounts.length === 0) return "Veri yok";
  return metric.amounts.map((a) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: a.currency, maximumFractionDigits: 0 }).format(a.amount)).join(" · ");
}

function BusinessOverviewCard({ overview }: { overview: BusinessOverview }) {
  return <Card title="İşletme Genel Görünümü">
    <div className="flex items-center justify-between"><span className={`text-sm font-semibold ${HEALTH_TONE[overview.financialHealthLevel] ?? ""}`}>{HEALTH_LABEL[overview.financialHealthLevel] ?? overview.financialHealthLevel}</span><span className="text-[10px] text-[#697681]">Güncellendi: {new Date(overview.generatedAt).toLocaleString("tr-TR")}</span></div>
    <p className="mt-2 text-sm leading-6 text-[#93a0ad]">{overview.financialExecutiveSummary}</p>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Info title="Aylık gelir" value={formatMetricAmounts(overview.financialSummary.monthlyRevenue)}/>
      <Info title="Aylık gider" value={formatMetricAmounts(overview.financialSummary.monthlyExpense)}/>
      <Info title="Nakit durumu" value={formatMetricAmounts(overview.financialSummary.cashPosition)}/>
      <Info title="Üretim kapasitesi kullanımı" value={overview.capacity.utilizationRatio === null ? "Veri yok" : `%${Math.round(overview.capacity.utilizationRatio * 100)}`}/>
    </div>
    {overview.goals.length > 0 ? <div className="mt-4"><p className="mb-2 text-[10px] uppercase tracking-wider text-[#697681]">Hedef İlerlemesi</p><div className="space-y-2">{overview.goals.map((goal) => <div key={goal.goalId} className="flex items-center justify-between border-b border-white/[.06] py-2 text-sm"><span className="text-[#c5ccd2]">{goal.title}</span><span className={`text-xs font-semibold ${GOAL_STATUS_TONE[goal.status] ?? ""}`}>{GOAL_STATUS_LABEL[goal.status] ?? goal.status}{goal.progressRatio !== null ? ` · %${Math.round(goal.progressRatio * 100)}` : ""}</span></div>)}</div></div> : null}
    {overview.activeRisks.length > 0 ? <div className="mt-4"><p className="mb-2 text-[10px] uppercase tracking-wider text-[#f16a7a]">Riskler</p><ul className="space-y-1.5 text-sm text-[#e8b4bb]">{overview.activeRisks.map((risk) => <li key={risk.code}>• {risk.detail}</li>)}</ul></div> : null}
    {overview.activeOpportunities.length > 0 ? <div className="mt-4"><p className="mb-2 text-[10px] uppercase tracking-wider text-[#3ddc97]">Fırsatlar</p><ul className="space-y-1.5 text-sm text-[#a6e8cf]">{overview.activeOpportunities.map((item) => <li key={item.code}>• {item.detail}</li>)}</ul></div> : null}
    {overview.activeRisks.length === 0 && overview.activeOpportunities.length === 0 ? <p className="mt-4 text-[10px] text-[#68747e]">Şu anda öne çıkan bir risk veya fırsat sinyali yok.</p> : null}
  </Card>;
}

function ProfileForm({ fields, profile, activeTab, onComplete }: { fields: Array<[string, string, string?]>; profile: Json; activeTab: string; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState<Json>(() => Object.fromEntries(fields.map(([key]) => [key, profile[key] ?? ""])));
  const [saving, setSaving] = useState(false);
  const stateRef = useRef({ draft, profile, activeTab, onComplete });
  stateRef.current = { draft, profile, activeTab, onComplete };
  const runtimeRef = useRef({
    getState: () => ({ activeTab: stateRef.current.activeTab, profile: stateRef.current.profile as Record<string, unknown>, draft: Object.fromEntries(Object.entries(stateRef.current.draft).map(([k, v]) => [k, Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "")])) }),
    setField: (field: CompanyProfileEditFieldName, value: string) => { setDraft((old) => ({ ...old, [field]: String(field).endsWith("Json") ? value.split(",").map((x) => x.trim()).filter(Boolean) : value })); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { setSaving(true); try { await api("/api/company", { method: "PATCH", body: JSON.stringify(stateRef.current.draft) }); await stateRef.current.onComplete("Canonical şirket profili güncellendi."); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } finally { setSaving(false); } },
    discard: () => { const p = stateRef.current.profile; const allKeys = Object.values(PROFILE_FIELDS).flatMap((tab) => tab.map(([k]) => k)); setDraft(Object.fromEntries(allKeys.map((k) => [k, p[k] ?? ""]))); },
  });
  useEffect(() => { const token = registerCompanyProfileEditSurfaceTarget({ entityId: "company", runtime: runtimeRef.current }); return () => unregisterCompanyProfileEditSurfaceTarget(token); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); await runtimeRef.current.commit(); };
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>{fields.map(([key, label, kind]) => <Field key={key} label={label} multiline={kind === "textarea"} value={typeof draft[key] === "string" ? String(draft[key]) : JSON.stringify(draft[key] ?? "")} onChange={(value) => setDraft((old) => ({ ...old, [key]: key.endsWith("Json") ? value.split(",").map((x) => x.trim()).filter(Boolean) : value }))}/>)}
    <div className="sm:col-span-2 flex justify-end"><Button disabled={saving}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</Button></div></form>;
}

function CandidateProfileForm({ fields, profile, title, activeTab, onComplete }: { fields: Array<[string, string]>; profile: Json; title: string; activeTab: string; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState<Json>(() => Object.fromEntries(fields.map(([key]) => [key, profile[key] ?? ""])));
  const stateRef = useRef({ draft, profile, activeTab, title, onComplete, fields });
  stateRef.current = { draft, profile, activeTab, title, onComplete, fields };
  const runtimeRef = useRef({
    getState: () => ({ activeTab: stateRef.current.activeTab, profile: stateRef.current.profile as Record<string, unknown>, draft: Object.fromEntries(Object.entries(stateRef.current.draft).map(([k, v]) => [k, Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "")])) }),
    setField: (field: CompanyProfileCandidateFieldName, value: string) => { setDraft((old) => ({ ...old, [field]: value })); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { const { draft: d, profile: p, fields: f, title: t, onComplete: done } = stateRef.current; const changes = f.filter(([key]) => String(d[key] ?? "") !== String(p[key] ?? "")).map(([key]) => ({ fieldPath: key, proposedValue: key.endsWith("Json") ? String(d[key]).split(",").map((x) => x.trim()).filter(Boolean) : d[key] })); if (!changes.length) return { ok: true }; try { await api("/api/company/candidates", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ targetDomain: "CompanyProfile", targetRecordId: typeof p.id === "string" ? p.id : undefined, operation: "UPDATE", propositionType: t, changes }) }); await done("Değişiklik doğrudan yazılmadı; açık onay için Business Candidate oluşturuldu."); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } },
    discard: () => { const { profile: p, fields: f } = stateRef.current; setDraft(Object.fromEntries(f.map(([key]) => [key, p[key] ?? ""]))); },
  });
  useEffect(() => { const token = registerCompanyProfileCandidateSurfaceTarget({ entityId: "company", runtime: runtimeRef.current }); return () => unregisterCompanyProfileCandidateSurfaceTarget(token); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); await runtimeRef.current.commit(); };
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>{fields.map(([key, label]) => <Field key={key} label={label} value={typeof draft[key] === "string" || typeof draft[key] === "number" ? String(draft[key]) : JSON.stringify(draft[key] ?? "")} onChange={(value) => setDraft((old) => ({ ...old, [key]: value }))}/>)}<div className="sm:col-span-2"><p className="mb-3 text-xs text-[#ffb066]">Bu alanlar resmî/finansal etki taşır. Kaydetme işlemi onay bekleyen Candidate üretir.</p><Button>Onaya gönder</Button></div></form>;
}

function UnitsPanel({ units, onComplete }: { units: Overview["units"]; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState<Json>({ unitType: "HEADQUARTERS", name: "", code: "", country: "TR", city: "", district: "", postalCode: "", addressLine1: "", addressLine2: "", isPrimary: units.length === 0 });
  const stateRef = useRef({ draft, units, onComplete });
  stateRef.current = { draft, units, onComplete };
  const draftRef = useRef<Json>(draft);
  draftRef.current = draft;
  const doCreate = useCallback(async () => {
    const d = draftRef.current;
    const { onComplete: done } = stateRef.current;
    const id = typeof d.id === "string" ? d.id : null;
    await api(id ? `/api/company/units/${id}` : "/api/company/units", { method: id ? "PATCH" : "POST", body: JSON.stringify(Object.fromEntries(Object.entries(d).filter(([key]) => key !== "id"))) });
    setDraft({ unitType: "BRANCH", name: "", code: "", country: "TR", city: "", district: "", postalCode: "", addressLine1: "", addressLine2: "" });
    await done(id ? "Operasyon birimi güncellendi." : "Operasyon birimi eklendi.");
  }, []);
  const formRuntimeRef = useRef({
    getState: () => ({ activeTab: "Adresler ve Birimler", draft: Object.fromEntries(Object.entries(stateRef.current.draft).map(([k, v]) => [k, String(v ?? "")])), units: stateRef.current.units }),
    setField: (field: CompanyUnitFormFieldName, value: string) => { draftRef.current = { ...draftRef.current, [field]: value }; setDraft((x) => ({ ...x, [field]: value })); },
    loadUnit: (unit: Overview["units"][number]) => { draftRef.current = { ...unit }; setDraft({ ...unit }); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { try { await doCreate(); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } },
    discard: () => { setDraft({ unitType: "BRANCH", name: "", code: "", country: "TR", city: "", district: "", postalCode: "", addressLine1: "", addressLine2: "" }); },
  });
  useLayoutEffect(() => {
    const token = registerCompanyUnitFormSurfaceTarget({ entityId: "company-unit-form", runtime: formRuntimeRef.current });
    return () => unregisterCompanyUnitFormSurfaceTarget(token);
  }, []);
  useLayoutEffect(() => {
    const tokens = units.map((unit) => registerCompanyUnitActionSurfaceTarget({
      entityId: unit.id,
      runtime: {
        getState: () => ({ name: unit.name, unitType: unit.unitType, isPrimary: unit.isPrimary, active: unit.active ?? true }),
        applyCommand: async (command) => {
          try {
            const patch = command.type === "make_primary" ? { isPrimary: true } : { active: false };
            await api(`/api/company/units/${unit.id}`, { method: "PATCH", body: JSON.stringify(patch) });
            await stateRef.current.onComplete(command.type === "make_primary" ? "Birim primary olarak ayarlandı." : "Birim ve bağlı geçmiş korunarak pasifleştirildi.");
            return { status: "EXECUTED", command };
          } catch (error) { return { status: "EXECUTION_FAILED", error: (error as Error).message }; }
        },
      },
    }));
    return () => { tokens.forEach(unregisterCompanyUnitActionSurfaceTarget); };
  }, [units]); // useLayoutEffect: register synchronously after DOM update so voice commands see targets immediately
  const create = async (event: FormEvent) => { event.preventDefault(); await doCreate(); };
  const change = async (unit: Overview["units"][number], patch: Json) => { await api(`/api/company/units/${unit.id}`, { method: "PATCH", body: JSON.stringify(patch) }); await onComplete(patch.active === false ? "Birim ve bağlı geçmiş korunarak pasifleştirildi." : "Birim güncellendi."); };
  return <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{units.length ? units.map((unit) => <Card key={unit.id} title={unit.name}><p className="text-xs text-[#93a0ad]">{unit.unitType} · {unit.city || "Şehir yok"} {unit.isPrimary ? "· Primary" : ""}</p><div className="mt-3 flex flex-wrap gap-2"><SmallButton onClick={() => void change(unit, { isPrimary: true })}>Primary yap</SmallButton><SmallButton onClick={() => setDraft({ ...unit })}>Tüm alanları düzenle</SmallButton><SmallButton danger onClick={() => void change(unit, { active: false })}>Pasifleştir</SmallButton></div></Card>) : <Empty text="Henüz birim yok."/>}</div><form className="grid gap-3 sm:grid-cols-2" onSubmit={create}><Field label="Birim adı" value={String(draft.name ?? "")} onChange={(value) => setDraft((x) => ({ ...x, name: value }))}/><Field label="Birim kodu" value={String(draft.code ?? "")} onChange={(value) => setDraft((x) => ({ ...x, code: value }))}/><Select label="Birim türü" value={String(draft.unitType)} options={["HEADQUARTERS", "BILLING", "SHIPPING", "BRANCH", "WAREHOUSE", "FACTORY", "OFFICE", "OTHER"]} onChange={(value) => setDraft((x) => ({ ...x, unitType: value }))}/><Field label="Ülke" value={String(draft.country ?? "")} onChange={(value) => setDraft((x) => ({ ...x, country: value }))}/><Field label="Şehir" value={String(draft.city ?? "")} onChange={(value) => setDraft((x) => ({ ...x, city: value }))}/><Field label="İlçe" value={String(draft.district ?? "")} onChange={(value) => setDraft((x) => ({ ...x, district: value }))}/><Field label="Posta kodu" value={String(draft.postalCode ?? "")} onChange={(value) => setDraft((x) => ({ ...x, postalCode: value }))}/><Field label="Adres satırı 1" value={String(draft.addressLine1 ?? "")} onChange={(value) => setDraft((x) => ({ ...x, addressLine1: value }))}/><Field label="Adres satırı 2" value={String(draft.addressLine2 ?? "")} onChange={(value) => setDraft((x) => ({ ...x, addressLine2: value }))}/><div className="sm:col-span-2"><Button>{draft.id ? "Birimi güncelle" : "Yeni birim ekle"}</Button></div></form></div>;
}

function GoalsPanel({ goals, onComplete }: { goals: Overview["goals"]; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ title: "", scope: "COMPANY", goalType: "SALES", period: "YEARLY", currency: "TRY", targetValue: "" });
  const stateRef = useRef({ draft, onComplete });
  stateRef.current = { draft, onComplete };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const doCreate = useCallback(async () => {
    const d = draftRef.current;
    const { onComplete: done } = stateRef.current;
    await api("/api/goals", { method: "POST", body: JSON.stringify({ ...d, targetValue: d.targetValue ? Number(d.targetValue) : undefined }) });
    setDraft({ title: "", scope: "COMPANY", goalType: "SALES", period: "YEARLY", currency: "TRY", targetValue: "" });
    await done("Canonical hedef oluşturuldu.");
  }, []);
  const formRuntimeRef = useRef({
    getState: () => ({ activeTab: "Hedefler", draft: stateRef.current.draft }),
    setField: (field: CompanyGoalCreateFieldName, value: string) => { draftRef.current = { ...draftRef.current, [field]: value }; setDraft((x) => ({ ...x, [field]: value })); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { try { await doCreate(); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } },
  });
  useLayoutEffect(() => {
    const token = registerCompanyGoalCreateSurfaceTarget({ entityId: "company-goal-create", runtime: formRuntimeRef.current });
    return () => unregisterCompanyGoalCreateSurfaceTarget(token);
  }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); await doCreate(); };
  return <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{goals.length ? goals.map((goal) => <Card key={goal.id} title={goal.title}><p className="text-sm text-[#34e6cf]">{goal.actualValue ?? "0"} / {goal.targetValue ?? "—"} {goal.currency}</p></Card>) : <Empty text="Aktif hedef yok."/>}</div><form className="space-y-3" onSubmit={submit}><Field label="Hedef adı" value={draft.title} onChange={(title) => setDraft((x) => ({ ...x, title }))}/><Select label="Kapsam" value={draft.scope} options={["COMPANY", "TEAM", "PERSON", "CUSTOMER_SEGMENT", "PRODUCT", "BRANCH"]} onChange={(scope) => setDraft((x) => ({ ...x, scope }))}/><Select label="Hedef türü" value={draft.goalType} options={["SALES", "COLLECTION", "REVENUE", "GROSS_PROFIT", "NEW_CUSTOMER", "ACTIVITY", "CUSTOM"]} onChange={(goalType) => setDraft((x) => ({ ...x, goalType }))}/><Field label="Hedef değer" value={draft.targetValue} onChange={(targetValue) => setDraft((x) => ({ ...x, targetValue }))}/><Button>Hedef oluştur</Button></form></div>;
}

function AssetsPanel({ assets, onComplete }: { assets: Overview["assets"]; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ name: "", assetType: "EQUIPMENT", currency: "TRY", description: "", acquisitionDate: "", acquisitionValue: "", currentBookValue: "", estimatedCurrentValue: "" });
  const stateRef = useRef({ draft, onComplete });
  stateRef.current = { draft, onComplete };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const doCreate = useCallback(async () => {
    const d = draftRef.current;
    const { onComplete: done } = stateRef.current;
    const numeric = ["acquisitionValue", "currentBookValue", "estimatedCurrentValue"] as const;
    const payload: Json = Object.fromEntries(Object.entries(d).filter(([, value]) => value !== ""));
    for (const key of numeric) if (d[key]) payload[key] = Number(d[key]);
    await api("/api/company/assets", { method: "POST", body: JSON.stringify(payload) });
    setDraft({ name: "", assetType: "EQUIPMENT", currency: "TRY", description: "", acquisitionDate: "", acquisitionValue: "", currentBookValue: "", estimatedCurrentValue: "" });
    await done("Canonical varlık kaydı oluşturuldu.");
  }, []);
  const formRuntimeRef = useRef({
    getState: () => ({ activeTab: "Varlıklar", draft: stateRef.current.draft }),
    setField: (field: CompanyAssetCreateFieldName, value: string) => { draftRef.current = { ...draftRef.current, [field]: value }; setDraft((x) => ({ ...x, [field]: value })); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { try { await doCreate(); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } },
  });
  useLayoutEffect(() => {
    const token = registerCompanyAssetCreateSurfaceTarget({ entityId: "company-asset-create", runtime: formRuntimeRef.current });
    return () => unregisterCompanyAssetCreateSurfaceTarget(token);
  }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); await doCreate(); };
  return <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{assets.length ? assets.map((asset) => <Card key={asset.id} title={asset.name}><p className="text-xs text-[#93a0ad]">{asset.assetType} · {asset.currentBookValue ?? "Değer yok"} {asset.currency}</p></Card>) : <Empty text="Canonical varlık kaydı yok."/>}</div><form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}><Field label="Varlık adı" value={draft.name} onChange={(name) => setDraft((x) => ({ ...x, name }))}/><Select label="Varlık türü" value={draft.assetType} options={["CASH_BANK_REFERENCE", "MACHINE", "VEHICLE", "REAL_ESTATE", "EQUIPMENT", "OTHER_NON_INVENTORY"]} onChange={(assetType) => setDraft((x) => ({ ...x, assetType }))}/><Field label="Açıklama" value={draft.description} onChange={(description) => setDraft((x) => ({ ...x, description }))}/><Field label="Edinim tarihi" value={draft.acquisitionDate} onChange={(acquisitionDate) => setDraft((x) => ({ ...x, acquisitionDate }))}/><Field label="Edinim değeri" value={draft.acquisitionValue} onChange={(acquisitionValue) => setDraft((x) => ({ ...x, acquisitionValue }))}/><Field label="Defter değeri" value={draft.currentBookValue} onChange={(currentBookValue) => setDraft((x) => ({ ...x, currentBookValue }))}/><Field label="Tahmini güncel değer" value={draft.estimatedCurrentValue} onChange={(estimatedCurrentValue) => setDraft((x) => ({ ...x, estimatedCurrentValue }))}/><div className="sm:col-span-2"><Button>Varlık ekle</Button></div></form></div>;
}

type BizimHesapStatus = { connected: boolean; status: "CONNECTED" | "ERROR" | "NOT_CONNECTED"; connectedAt: string | null; lastSuccessfulSyncAt: string | null; lastErrorCode: string | null };

function BizimHesapPanel({ onComplete }: { onComplete: (message: string) => Promise<void> }) {
  const [status, setStatus] = useState<BizimHesapStatus | null>(null);
  const [draft, setDraft] = useState({ token: "", firmId: "" });
  const [busy, setBusy] = useState(false);
  const [snapshotSummary, setSnapshotSummary] = useState<string | null>(null);
  const load = useCallback(() => { void api("/api/integrations/bizimhesap/status").then(setStatus); }, []);
  useEffect(load, [load]);
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/integrations/bizimhesap/connect", { method: "POST", body: JSON.stringify({ token: draft.token, firmId: draft.firmId || undefined }) });
      setDraft({ token: "", firmId: "" });
      load();
      await onComplete("Bizim Hesap bağlantısı kuruldu.");
    } catch (error) {
      await onComplete((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await api("/api/integrations/bizimhesap/disconnect", { method: "DELETE" });
      setSnapshotSummary(null);
      load();
      await onComplete("Bizim Hesap bağlantısı kesildi.");
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    setBusy(true);
    try {
      const snapshot = await api("/api/integrations/bizimhesap/sync", { method: "POST" });
      setSnapshotSummary(`${snapshot.products.length} ürün, ${snapshot.warehouses.length} depo okundu — yalnızca görüntüleme, METRIX kayıtlarına yazılmadı.`);
      load();
      await onComplete("Bizim Hesap kataloğu senkronize edildi.");
    } catch (error) {
      await onComplete((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return <Card title="Bizim Hesap">
    {!status ? <p className="text-xs text-[#697681]">Yükleniyor…</p> : !status.connected ? (
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={connect}>
        <p className="text-xs text-[#93a0ad] sm:col-span-2">Bizim Hesap hesabınızdan aldığınız Token&apos;ı girin. Fatura gönderimi (push) ve ürün/depo/stok görüntüleme (pull) için kullanılır — METRIX&apos;in kendi ürün/stok kayıtlarını değiştirmez.</p>
        <Field label="Bizim Hesap Token" value={draft.token} onChange={(token) => setDraft((x) => ({ ...x, token }))}/>
        <Field label="Firma ID (opsiyonel, fatura göndermek için gerekir)" value={draft.firmId} onChange={(firmId) => setDraft((x) => ({ ...x, firmId }))}/>
        <div className="sm:col-span-2"><Button disabled={busy || !draft.token.trim()}>{busy ? "Bağlanıyor…" : "Bağlan"}</Button></div>
      </form>
    ) : (
      <div className="space-y-3">
        <p className="text-sm text-[#3ddc97]">Bağlı · {status.connectedAt ? new Date(status.connectedAt).toLocaleDateString("tr-TR") : "—"} tarihinden beri</p>
        <p className="text-xs text-[#93a0ad]">Son senkronizasyon: {status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString("tr-TR") : "Henüz yok"}</p>
        {status.status === "ERROR" ? <p className="text-xs text-[#f16a7a]">Son hata: {status.lastErrorCode}</p> : null}
        {snapshotSummary ? <p className="text-xs text-[#93a0ad]">{snapshotSummary}</p> : null}
        <div className="flex flex-wrap gap-2"><SmallButton onClick={() => void sync()}>Şimdi senkronize et</SmallButton><SmallButton danger onClick={() => void disconnect()}>Bağlantıyı kes</SmallButton></div>
      </div>
    )}
  </Card>;
}

type IcloudStatus = { connected: boolean; appleId: string | null; status: "CONNECTED" | "AUTH_REQUIRED" | "NOT_CONNECTED" | "ERROR"; connectedAt: string | null; lastSuccessfulAccessAt: string | null; lastErrorCode: string | null };

function IcloudPanel({ onComplete }: { onComplete: (message: string) => Promise<void> }) {
  const [status, setStatus] = useState<IcloudStatus | null>(null);
  const [draft, setDraft] = useState({ appleId: "", appSpecificPassword: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { void api("/api/integrations/icloud/status").then(setStatus); }, []);
  useEffect(load, [load]);
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/integrations/icloud/connect", { method: "POST", body: JSON.stringify(draft) });
      setDraft({ appleId: "", appSpecificPassword: "" });
      load();
      await onComplete("iCloud Takvim bağlantısı kuruldu.");
    } catch (error) {
      await onComplete((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await api("/api/integrations/icloud/disconnect", { method: "DELETE" });
      load();
      await onComplete("iCloud Takvim bağlantısı kesildi.");
    } finally {
      setBusy(false);
    }
  };
  return <Card title="iCloud Takvim">
    {!status ? <p className="text-xs text-[#697681]">Yükleniyor…</p> : !status.connected ? (
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={connect}>
        <p className="text-xs text-[#93a0ad] sm:col-span-2">Apple ID&apos;nizi ve account.apple.com &gt; Oturum Açma ve Güvenlik &gt; Uygulamaya Özel Parolalar bölümünden oluşturduğunuz uygulamaya özel parolayı girin. Normal Apple hesabı şifrenizi asla girmeyin — METRIX bunu istemez ve kabul etmez.</p>
        <Field label="Apple ID" value={draft.appleId} onChange={(appleId) => setDraft((x) => ({ ...x, appleId }))}/>
        <label className="block text-xs text-[#93a0ad]">Uygulamaya özel parola<input autoComplete="off" className="mt-1 w-full rounded-xl border border-white/10 bg-[#08151e] px-3 py-2.5 text-sm outline-none focus:border-[#34e6cf]/50" onChange={(e) => setDraft((x) => ({ ...x, appSpecificPassword: e.target.value }))} type="password" value={draft.appSpecificPassword}/></label>
        <div className="sm:col-span-2"><Button disabled={busy || !draft.appleId.trim() || !draft.appSpecificPassword.trim()}>{busy ? "Bağlanıyor…" : "Bağlan"}</Button></div>
      </form>
    ) : (
      <div className="space-y-3">
        <p className="text-sm text-[#3ddc97]">Bağlı · {status.appleId} · {status.connectedAt ? new Date(status.connectedAt).toLocaleDateString("tr-TR") : "—"} tarihinden beri</p>
        <p className="text-xs text-[#93a0ad]">Son başarılı okuma: {status.lastSuccessfulAccessAt ? new Date(status.lastSuccessfulAccessAt).toLocaleString("tr-TR") : "Henüz yok"}</p>
        {status.status === "AUTH_REQUIRED" ? <p className="text-xs text-[#f16a7a]">Parola geçersiz görünüyor — yeniden bağlanmanız gerekebilir.</p> : status.status === "ERROR" ? <p className="text-xs text-[#f16a7a]">Son hata: {status.lastErrorCode}</p> : null}
        <div className="flex flex-wrap gap-2"><SmallButton danger onClick={() => void disconnect()}>Bağlantıyı kes</SmallButton></div>
      </div>
    )}
  </Card>;
}

function SourcesPanel({ sources, onComplete }: { sources: Overview["dataSources"]; onComplete: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ provider: "", sourceType: "ERP", connectionStatus: "PENDING" });
  const stateRef = useRef({ draft, onComplete });
  stateRef.current = { draft, onComplete };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const doCreate = useCallback(async () => {
    const d = draftRef.current;
    const { onComplete: done } = stateRef.current;
    await api("/api/company/data-sources", { method: "POST", body: JSON.stringify(d) });
    setDraft({ provider: "", sourceType: "ERP", connectionStatus: "PENDING" });
    await done("Veri kaynağı canonical registry'ye kaydedildi.");
  }, []);
  const formRuntimeRef = useRef({
    getState: () => ({ activeTab: "Entegrasyonlar", draft: stateRef.current.draft }),
    setField: (field: CompanySourceCreateFieldName, value: string) => { draftRef.current = { ...draftRef.current, [field]: value }; setDraft((x) => ({ ...x, [field]: value })); },
    commit: async (): Promise<{ ok: boolean; error?: string }> => { try { await doCreate(); return { ok: true }; } catch (error) { return { ok: false, error: (error as Error).message }; } },
  });
  useLayoutEffect(() => {
    const token = registerCompanySourceCreateSurfaceTarget({ entityId: "company-source-create", runtime: formRuntimeRef.current });
    return () => unregisterCompanySourceCreateSurfaceTarget(token);
  }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); await doCreate(); };
  return <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{sources.length ? sources.map((source) => <Card key={source.id} title={source.provider}><p className="text-xs text-[#93a0ad]">{source.connectionStatus}</p></Card>) : <Empty text="Bağlı veri kaynağı yok."/>}</div><form className="space-y-3" onSubmit={submit}><Field label="Provider" value={draft.provider} onChange={(provider) => setDraft((x) => ({ ...x, provider }))}/><Select label="Kaynak türü" value={draft.sourceType} options={["ERP", "CRM", "ACCOUNTING", "DOCUMENT", "API", "OTHER"]} onChange={(sourceType) => setDraft((x) => ({ ...x, sourceType }))}/><Button>Veri kaynağı ekle</Button></form></div>;
}

function ReportsPanel({ onComplete }: { onComplete: (message: string) => Promise<void> }) {
  const [reports, setReports] = useState<ReportOverview | null>(null);
  const [draft, setDraft] = useState({ name: "", focused: "Önemli gelişme,Müşteri riski,Destek ihtiyacı", dynamic: "Sistemde görünmeyen önemli konu", rationale: "Haftalık yönetim ritmi" });
  const [assignment, setAssignment] = useState({ assigneeUserId: "", dueDate: "" });
  const load = useCallback(() => { void api("/api/company/reports").then(setReports); }, []);
  useEffect(load, [load]);
  const create = async (event: FormEvent) => { event.preventDefault(); await api("/api/company/reports", { method: "POST", body: JSON.stringify({ name: draft.name, focusedSection: draft.focused.split(","), dynamicQuestions: draft.dynamic.split(","), rationale: draft.rationale }) }); load(); await onComplete("Versiyon 1 haftalık rapor şablonu oluşturuldu."); };
  const version = async (template: ReportOverview["templates"][number]) => { const latest = template.versions[0] as Json | undefined; await api(`/api/company/reports/${template.id}/versions`, { method: "POST", body: JSON.stringify({ fixedCore: latest?.fixedCoreJson ?? [], focusedSection: draft.focused.split(","), dynamicQuestions: draft.dynamic.split(","), rationale: draft.rationale }) }); load(); await onComplete("Geçmiş submission'lara dokunulmadan yeni template version oluşturuldu."); };
  const assign = async (template: ReportOverview["templates"][number]) => { if (!assignment.assigneeUserId || !assignment.dueDate) return; await api(`/api/company/reports/${template.id}/assignments`, { method: "POST", body: JSON.stringify(assignment) }); load(); await onComplete("Çalışan ataması ve gerçek submission takvimi oluşturuldu."); };
  return <div className="grid gap-5 lg:grid-cols-2"><div><div className="mb-3 grid grid-cols-3 gap-2">{["activeTemplates", "submitted", "overdue"].map((key) => <Info key={key} title={key} value={String(reports?.summary[key] ?? 0)}/>)}</div><div className="space-y-3">{reports?.templates.length ? reports.templates.map((template) => <Card key={template.id} title={template.name}><p className="text-xs text-[#93a0ad]">{template.versions.length} immutable version · {template.assignments.length} aktif atama</p><SmallButton onClick={() => void version(template)}>Yeni version oluştur</SmallButton><div className="mt-3 grid gap-2 sm:grid-cols-2"><Select label="Çalışan/ekip üyesi" value={assignment.assigneeUserId} options={["", ...(reports?.members.map((x) => x.userId) ?? [])]} onChange={(assigneeUserId) => setAssignment((x) => ({ ...x, assigneeUserId }))}/><Field label="Son teslim (ISO)" value={assignment.dueDate} onChange={(dueDate) => setAssignment((x) => ({ ...x, dueDate }))}/></div><SmallButton onClick={() => void assign(template)}>Atama yap</SmallButton></Card>) : <Empty text="Aktif rapor şablonu yok."/>}</div></div><form className="space-y-3" onSubmit={create}><Field label="Şablon adı" value={draft.name} onChange={(name) => setDraft((x) => ({ ...x, name }))}/><Field label="Rol/sektör soruları (virgülle)" value={draft.focused} onChange={(focused) => setDraft((x) => ({ ...x, focused }))}/><Field label="METRIX dinamik soru önerileri" value={draft.dynamic} onChange={(dynamic) => setDraft((x) => ({ ...x, dynamic }))}/><Field label="Değişiklik gerekçesi" value={draft.rationale} onChange={(rationale) => setDraft((x) => ({ ...x, rationale }))}/><Button>Haftalık rapor oluştur</Button></form></div>;
}

function SystemPanel({ onComplete }: { onComplete: (message: string) => Promise<void> }) {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [draft, setDraft] = useState({ label: "", key: "", description: "", valueType: "string", unit: "", uiSection: "Kurumsal Alanlar", sensitivity: "INTERNAL", riskLevel: "LOW", approvalPolicy: "NONE" });
  const load = useCallback(() => { void Promise.all([api("/api/company/field-definitions"), api("/api/company/candidates")]).then(([fields, pending]) => { setDefinitions(fields.definitions); setCandidates(pending.candidates); }); }, []);
  useEffect(load, [load]);
  const create = async (event: FormEvent) => { event.preventDefault(); const request = await api("/api/company/field-definitions/actions/create", { method: "POST", body: JSON.stringify({ phase: "REQUEST", input: { ...draft, module: "company", entityType: "company" } }) }); await api("/api/company/field-definitions/actions/create", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ phase: "CONFIRM", approvalId: request.approval.approvalId, input: request.preview }) }); load(); await onComplete("Ortak field authority içinde Company field definition oluşturuldu."); };
  const approve = async (candidate: Candidate) => { await api(`/api/business-candidates/${candidate.id}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ approvedChangeIds: candidate.changes.map((x) => x.id), rejectedChangeIds: [] }) }); load(); await onComplete("Candidate onaylandı ve canonical state'e promote edildi."); };
  const deprecate = async (definition: FieldDefinition) => { const request = await api(`/api/company/field-definitions/${definition.id}/actions/deprecate`, { method: "POST", body: JSON.stringify({ phase: "REQUEST", input: {} }) }); await api(`/api/company/field-definitions/${definition.id}/actions/deprecate`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ phase: "CONFIRM", approvalId: request.approval.approvalId, input: {} }) }); load(); await onComplete("Field definition geçmiş değerler korunarak pasifleştirildi."); };
  const writeValue = async (definition: FieldDefinition) => { const value = window.prompt(`${definition.label} değeri`); if (value === null) return; if (definition.riskLevel === "HIGH" || definition.approvalPolicy === "EXPLICIT") await api("/api/company/candidates", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ targetDomain: "CompanyDynamicFieldValue", operation: "UPDATE", changes: [{ fieldPath: "definitionId", proposedValue: definition.id }, { fieldPath: "value", proposedValue: value }] }) }); else await api("/api/company/field-values", { method: "PUT", body: JSON.stringify({ definitionId: definition.id, value }) }); load(); await onComplete(definition.riskLevel === "HIGH" || definition.approvalPolicy === "EXPLICIT" ? "Alan değeri onay için Candidate olarak kaydedildi." : "Dynamic Company field değeri yazıldı."); };
  return <div className="space-y-6"><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{definitions.length ? definitions.map((field) => <Card key={field.id} title={field.label}><p className="text-xs text-[#93a0ad]">{field.key} · {field.valueType} {field.unit || ""}</p><SmallButton onClick={() => void writeValue(field)}>Değer yaz</SmallButton><SmallButton danger onClick={() => void deprecate(field)}>Pasifleştir</SmallButton></Card>) : <Empty text="Company dynamic field yok."/>}</div><form className="grid gap-3 sm:grid-cols-2" onSubmit={create}><Field label="Alan adı" value={draft.label} onChange={(label) => setDraft((x) => ({ ...x, label, key: x.key || label.toLocaleLowerCase("tr-TR").replace(/\s+/g, "_") }))}/><Field label="Stable key" value={draft.key} onChange={(key) => setDraft((x) => ({ ...x, key }))}/><Field label="Açıklama" value={draft.description} onChange={(description) => setDraft((x) => ({ ...x, description }))}/><Field label="Birim" value={draft.unit} onChange={(unit) => setDraft((x) => ({ ...x, unit }))}/><Select label="Value type" value={draft.valueType} options={["string", "multiline_string", "integer", "money", "percentage", "boolean", "date", "enum"]} onChange={(valueType) => setDraft((x) => ({ ...x, valueType }))}/><Select label="Risk" value={draft.riskLevel} options={["LOW", "MEDIUM", "HIGH"]} onChange={(riskLevel) => setDraft((x) => ({ ...x, riskLevel }))}/><div className="sm:col-span-2"><Button>Field definition oluştur</Button></div></form></div><div><h3 className="mb-3 text-sm font-semibold">Doğrulama bekleyen değişiklikler</h3>{candidates.length ? candidates.map((candidate) => <Card key={candidate.id} title={candidate.targetDomain}><p className="mb-3 text-xs text-[#ffb066]">{candidate.changes.map((x) => x.fieldPath).join(", ")}</p><SmallButton onClick={() => void approve(candidate)}>Onayla ve promote et</SmallButton></Card>) : <Empty text="Bekleyen Company Candidate yok."/>}</div></div>;
}

// Sabah 07:00 araştırmasının (research-director → daily-briefing-orchestrator)
// önerdiği MemoryCandidate'leri (durum PENDING) burada gösterir. Onaylanan
// bir aday, gerçek ve canlı sohbette kullanılan bir MemoryItem'a dönüşür —
// approveMemoryCandidateForOrganization zaten üretimde var ve çalışıyor,
// yalnızca bunu tetikleyecek bir arayüz yoktu (self-education loop
// candidate aşamasında kırıktı). Onay/ret/yoksay her zaman sahip/yönetici
// kararı gerektirir — METRIX'in kendi öğrendiği bir "gerçeği" hiçbir zaman
// otomatik olarak kalıcı hafızaya yazmaz.
const MEMORY_TYPE_LABEL: Record<string, string> = { FACT: "Gerçek", PREFERENCE: "Tercih", PROCESS: "Süreç", STRATEGIC: "Stratejik" };
const MEMORY_SOURCE_LABEL: Record<string, string> = { USER_PROVIDED: "Kullanıcı", USER_CORRECTION: "Kullanıcı düzeltmesi", CANDIDATE_APPROVED: "Onaylanmış aday", ONBOARDING: "Onboarding", SYSTEM_INFERRED: "METRIX araştırması", EVENT_DERIVED: "Olay tabanlı" };

function MemoryCandidatePanel({ onComplete }: { onComplete: (message: string) => Promise<void> }) {
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(() => { void api("/api/memory-candidates/pending").then((data) => setCandidates(data.candidates)); }, []);
  useEffect(load, [load]);
  const decide = async (candidate: MemoryCandidate, action: "approve" | "reject" | "dismiss", message: string) => {
    setBusyId(candidate.id);
    try {
      await api(`/api/memory-candidates/${candidate.id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      load();
      await onComplete(message);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <div>
      <p className="mb-4 text-xs text-[#93a0ad]">METRIX&apos;in sabah araştırmasından ve gözlemlerinden çıkardığı, henüz kalıcı hafızaya yazılmamış bilgiler. Onayladığın bilgi kalıcı olur ve METRIX bundan sonra bunu bilerek konuşur; reddettiğin ya da yoksaydığın bilgi hiçbir yerde saklanmaz.</p>
      {candidates.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {candidates.map((candidate) => (
            <Card key={candidate.id} title={candidate.proposedKey}>
              <p className="text-xs uppercase tracking-wider text-[#697681]">{MEMORY_TYPE_LABEL[candidate.proposedType] ?? candidate.proposedType} · {MEMORY_SOURCE_LABEL[candidate.source] ?? candidate.source} · %{candidate.confidence} güven</p>
              <p className="mt-2 text-sm text-[#dce2e6]">{candidate.proposedValue}</p>
              <p className="mt-2 text-xs text-[#93a0ad]">{candidate.reason}</p>
              <div className="mt-1">
                <SmallButton onClick={() => void decide(candidate, "approve", "Bilgi onaylandı ve kalıcı hafızaya eklendi.")}>{busyId === candidate.id ? "…" : "Onayla"}</SmallButton>
                <SmallButton danger onClick={() => void decide(candidate, "reject", "Bilgi reddedildi.")}>{busyId === candidate.id ? "…" : "Reddet"}</SmallButton>
                <SmallButton onClick={() => void decide(candidate, "dismiss", "Bilgi yoksayıldı.")}>{busyId === candidate.id ? "…" : "Yoksay"}</SmallButton>
              </div>
            </Card>
          ))}
        </div>
      ) : <Empty text="Onay bekleyen öğrenilmiş bilgi yok." />}
    </div>
  );
}

function State({ text }: { text: string }) { return <main className="grid min-h-full place-items-center text-sm text-[#93a0ad]" style={{ background: PAGE_BACKGROUND }}>{text}</main>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-[22px] border border-white/[.07] bg-black/10 p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-[#697681]">{text}</div>; }
function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) { const colors: Record<string, string> = { cyan: "text-[#34e6cf]", blue: "text-[#7fa4ff]", amber: "text-[#ffb066]", green: "text-[#3ddc97]" }; return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4"><p className={`text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[11px] font-medium text-[#93a0ad]">{label}</p></div>; }
function Info({ title, value }: { title: string; value: string }) { return <div className="rounded-2xl border border-white/[.06] bg-black/10 p-3"><p className="text-[9px] uppercase tracking-wider text-[#697681]">{title}</p><p className="mt-1 text-sm text-[#dce2e6]">{value}</p></div>; }
function Metric({ label, metric }: { label: string; metric?: { value: number | null; currency: string } }) { const value = metric?.value === null || metric?.value === undefined ? "Veri yok" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: metric.currency, maximumFractionDigits: 0 }).format(metric.value); return <div className="flex justify-between border-b border-white/[.06] py-3 text-sm"><span className="text-[#8e9aa4]">{label}</span><span className={metric?.value === null ? "text-[#ffb066]" : "font-semibold"}>{value}</span></div>; }
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) { const cls = "mt-1 w-full rounded-xl border border-white/10 bg-[#08151e] px-3 py-2.5 text-sm outline-none focus:border-[#34e6cf]/50"; return <label className="block text-xs text-[#93a0ad]">{label}{multiline ? <textarea className={cls} rows={4} value={value} onChange={(e) => onChange(e.target.value)}/> : <input className={cls} value={value} onChange={(e) => onChange(e.target.value)}/>}</label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="block text-xs text-[#93a0ad]">{label}<select className="mt-1 w-full rounded-xl border border-white/10 bg-[#08151e] px-3 py-2.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((x) => <option key={x}>{x}</option>)}</select></label>; }
function Button({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) { return <button disabled={disabled} className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#05201e] disabled:opacity-50">{children}</button>; }
function SmallButton({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={onClick} className={`mr-2 mt-3 rounded-lg border px-3 py-1.5 text-xs ${danger ? "border-[#f16a7a]/25 text-[#f16a7a]" : "border-[#34e6cf]/25 text-[#34e6cf]"}`}>{children}</button>; }
