"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";
import {
  approveOffer,
  createCollection,
  createCustomer,
  createDocument,
  createFinanceItem,
  createGoal,
  createOffer,
  createProduct,
  createReportTemplate,
  createSalesOpportunity,
  createSupplier,
  createTask,
  createTeamMember,
  createWorkPlanItem,
  deleteCustomer,
  deleteCollection,
  deleteDocument,
  deleteFinanceItem,
  deleteGoal,
  deleteOffer,
  deleteProduct,
  deleteReportTemplate,
  deleteSalesOpportunity,
  deleteSupplier,
  deleteTask,
  deleteTeamMember,
  deleteWorkPlanItem,
  generateReport,
  readWorkspaceData,
  submitOfferQuestion,
  suggestTemplatesByIndustry,
  trackOfferView,
  updateAccountingProfile,
  updateCollection,
  updateCustomer,
  updateDocument,
  updateFinanceItem,
  updateGoal,
  updateOffer,
  updateProduct,
  updateReportTemplate,
  updateSalesOpportunity,
  updateSupplier,
  updateTask,
  updateTeamMember,
  updateCompanyProfile,
  updateWorkPlanItem,
} from "@/lib/metrix-workspace/metrix-workspace.service";
import type {
  AccountingProfile,
  ActivityLogEntry,
  BusinessDocument,
  Collection,
  CompanyProfile,
  ExecutiveTask,
  FinanceItem,
  GeneratedReport,
  Goal,
  MetrixCustomer,
  MetrixWorkspaceData,
  Offer,
  OfferLineItem,
  Product,
  ReportTemplate,
  SalesOpportunity,
  Supplier,
  TeamMember,
  WorkPlanItem,
} from "@/lib/metrix-workspace/metrix-workspace.types";

type ModuleId =
  | "home"
  | "company"
  | "customers"
  | "products"
  | "offers"
  | "collections"
  | "work-plan"
  | "team"
  | "suppliers"
  | "documents"
  | "accounting"
  | "daily-rhythm"
  | "goals"
  | "company-dna"
  | "opinion"
  | "sales"
  | "finance"
  | "tasks"
  | "reports"
  | "templates";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

type GmailStatus = {
  connected: boolean;
  providerEmail: string | null;
  readOnly: true;
  status: "CONNECTED" | "RECONNECT_REQUIRED" | "NOT_CONNECTED";
  lastSuccessfulAccessAt: string | null;
  lastErrorCode: string | null;
};

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "date" | "number" | "textarea";
};

type ModuleMeta = {
  id: ModuleId;
  href: string;
  label: string;
  short: string;
  description: string;
  type: "ai" | "list" | "calendar" | "profile" | "legacy";
};

type ListRow = {
  id: string;
  title: string;
  values: Record<string, string>;
};

type ListConfig = {
  title: string;
  kpis: Array<{ label: string; value: string }>;
  columns: Array<{ key: string; label: string }>;
  rows: ListRow[];
};

type EditableItem =
  | MetrixCustomer
  | SalesOpportunity
  | FinanceItem
  | ExecutiveTask
  | ReportTemplate;

type LegacyEditorModule = "customers" | "sales" | "finance" | "tasks" | "templates";

const blankData: MetrixWorkspaceData = {
  companyProfile: {
    companyName: "",
    industry: "",
    workingStyle: "",
    mainGoal: "",
    notes: "",
    updatedAt: "",
  },
  accountingProfile: {
    accountantName: "",
    contact: "",
    integrationStatus: "",
    notes: "",
    updatedAt: "",
  },
  customers: [],
  products: [],
  offers: [],
  collections: [],
  team: [],
  suppliers: [],
  documents: [],
  goals: [],
  workPlan: [],
  sales: [],
  finance: [],
  tasks: [],
  templates: [],
  reports: [],
};

const modules: ModuleMeta[] = [
  {
    id: "home",
    href: "/metrix",
    label: "AI Genel Mudur",
    short: "GM",
    description: "Metrix'in sirketi okuyup karar ve aksiyon urettigi ana calisma ekrani.",
    type: "ai",
  },
  {
    id: "company",
    href: "/metrix/company",
    label: "Sirketim",
    short: "Sirket",
    description: "Profil, sektor, calisma duzeni, hedefler ve temel bilgiler.",
    type: "profile",
  },
  {
    id: "customers",
    href: "/metrix/customers",
    label: "Musteriler",
    short: "Musteri",
    description: "Portfoy kayitlari ve Metrix'in okuyacagi musteri sinyalleri.",
    type: "list",
  },
  {
    id: "products",
    href: "/metrix/products",
    label: "Urun / Hizmetler",
    short: "Urun",
    description: "Satilan urun ve hizmet katalogu.",
    type: "list",
  },
  {
    id: "offers",
    href: "/metrix/offers",
    label: "Teklifler",
    short: "Teklif",
    description: "Teklifler ve kapanis asamalari.",
    type: "list",
  },
  {
    id: "collections",
    href: "/metrix/collections",
    label: "Tahsilatlar",
    short: "Tahsil",
    description: "Vade, odeme durumu ve tahsilat riski.",
    type: "list",
  },
  {
    id: "work-plan",
    href: "/metrix/work-plan",
    label: "Is Plani",
    short: "Plan",
    description: "Gun, hafta, ay yogunluklari ve is takvimi.",
    type: "calendar",
  },
  {
    id: "team",
    href: "/metrix/team",
    label: "Personeller",
    short: "Ekip",
    description: "Sorumluluklar, kapasite ve ekip sinyalleri.",
    type: "list",
  },
  {
    id: "suppliers",
    href: "/metrix/suppliers",
    label: "Tedarikciler",
    short: "Tedarik",
    description: "Tedarikci iliskileri, risk ve odeme bilgileri.",
    type: "list",
  },
  {
    id: "documents",
    href: "/metrix/documents",
    label: "Evrak Merkezi",
    short: "Evrak",
    description: "Fatura, irsaliye, dekont, fiyat listesi ve kartvizitler.",
    type: "list",
  },
  {
    id: "accounting",
    href: "/metrix/accounting",
    label: "Muhasebe",
    short: "Muh",
    description: "Entegrasyonlar, aktarim durumu ve muhasebeci notlari.",
    type: "profile",
  },
  {
    id: "daily-rhythm",
    href: "/metrix/daily-rhythm",
    label: "Gunluk Ritim",
    short: "Ritim",
    description: "Sabah brifingi, iki odak ve kapanis degerlendirmesi.",
    type: "ai",
  },
  {
    id: "goals",
    href: "/metrix/goals",
    label: "Yonetim Hedefleri",
    short: "Hedef",
    description: "Hedef, ilerleme, sorumlu ve tarih takibi.",
    type: "list",
  },
  {
    id: "company-dna",
    href: "/metrix/company-dna",
    label: "Company DNA",
    short: "DNA",
    description: "Calisma tarzi, riskler, guclu yonler ve karar hafizasi.",
    type: "ai",
  },
  {
    id: "opinion",
    href: "/metrix/opinion",
    label: "Metrix Gorusu",
    short: "Gorus",
    description: "Risk, oncelik ve oneriler icin AI Genel Mudur yorumu.",
    type: "ai",
  },
];

// ─── V2 Navigation ────────────────────────────────────────────────────────────
// Users don't navigate menus — Metrix routes them via chat.
// Only 4 primary tabs are visible; all record modules live behind routes.

type PrimaryNavItem = { id: string; href: string; label: string; short: string };

const primaryNav: PrimaryNavItem[] = [
  { id: "home",    href: "/metrix",         label: "Ana Akis",  short: "Akis"   },
  { id: "company", href: "/metrix/company", label: "Sirketim",  short: "Sirket" },
  // METRIX (id: "metrix-chat") is rendered as a chat button, not a Link
  { id: "reports", href: "/metrix/reports", label: "Raporlar",  short: "Rapor"  },
];

// All company record modules — route-accessible but hidden from primary nav.
// TODO (UX V3): Each record detail should become a full-screen route/view,
//               not a side panel. Detail panels are interim until then.
const companyRecordModules: Array<{ id: string; href: string; label: string }> = [
  { id: "customers",   href: "/metrix/customers",   label: "Musteriler"      },
  { id: "offers",      href: "/metrix/offers",      label: "Teklifler"       },
  { id: "collections", href: "/metrix/collections", label: "Tahsilatlar"     },
  { id: "products",    href: "/metrix/products",    label: "Urun / Hizmetler"},
  { id: "work-plan",   href: "/metrix/work-plan",   label: "Is Plani"        },
  { id: "team",        href: "/metrix/team",         label: "Personeller"    },
  { id: "suppliers",   href: "/metrix/suppliers",   label: "Tedarikciler"    },
  { id: "documents",   href: "/metrix/documents",   label: "Evrak Merkezi"   },
  { id: "accounting",  href: "/metrix/accounting",  label: "Muhasebe"        },
  { id: "goals",       href: "/metrix/goals",       label: "Yonetim Hedefleri"},
];

const companyRecordPaths = new Set(companyRecordModules.map((m) => m.href));

function isPrimaryNavActive(navId: string, pathname: string): boolean {
  if (navId === "home")    return pathname === "/metrix";
  if (navId === "company") return pathname === "/metrix/company" || companyRecordPaths.has(pathname);
  if (navId === "reports") return pathname === "/metrix/reports";
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

const legacyModuleMeta: Record<"sales" | "finance" | "tasks" | "reports" | "templates", ModuleMeta> = {
  sales: {
    id: "sales",
    href: "/metrix/sales",
    label: "Satis",
    short: "Satis",
    description: "Eski gecici satis sayfasi. Ileride Teklifler alanina tasinacak.",
    type: "legacy",
  },
  finance: {
    id: "finance",
    href: "/metrix/finance",
    label: "Finans",
    short: "Finans",
    description: "Eski gecici finans sayfasi. Ileride Tahsilatlar alanina tasinacak.",
    type: "legacy",
  },
  tasks: {
    id: "tasks",
    href: "/metrix/tasks",
    label: "Aksiyonlar",
    short: "Isler",
    description: "Eski gecici aksiyon sayfasi. Ileride Is Plani ve Hedefler alanina tasinacak.",
    type: "legacy",
  },
  reports: {
    id: "reports",
    href: "/metrix/reports",
    label: "Raporlar",
    short: "Rapor",
    description: "Eski gecici rapor uretimi.",
    type: "legacy",
  },
  templates: {
    id: "templates",
    href: "/metrix/templates",
    label: "Sablonlar",
    short: "Sablon",
    description: "Eski gecici sektor sablonlari.",
    type: "legacy",
  },
};

const fieldMap: Record<LegacyEditorModule, Field[]> = {
  customers: [
    { key: "name", label: "Musteri adi", placeholder: "Orn. Nova Mimarlik" },
    { key: "industry", label: "Sektor", placeholder: "mimarlik, mermer, ajans..." },
    { key: "status", label: "Durum", placeholder: "Aktif / Sicak / Riskli" },
    { key: "collectionStatus", label: "Tahsilat", placeholder: "Normal / Takipte / Gecikmis" },
    { key: "notes", label: "Notlar", type: "textarea" },
  ],
  sales: [
    { key: "customer", label: "Musteri", placeholder: "Musteri adi" },
    { key: "name", label: "Firsat adi", placeholder: "Teklif / proje adi" },
    { key: "amount", label: "Tutar", type: "number", placeholder: "0" },
    { key: "stage", label: "Asama", placeholder: "Gorusme / Teklif / Kazanildi" },
    { key: "expectedCloseDate", label: "Beklenen kapanis", type: "date" },
    { key: "notes", label: "Notlar", type: "textarea" },
  ],
  finance: [
    { key: "customer", label: "Musteri", placeholder: "Musteri adi" },
    { key: "amount", label: "Tutar", type: "number", placeholder: "0" },
    { key: "dueDate", label: "Vade tarihi", type: "date" },
    { key: "paymentStatus", label: "Odeme durumu", placeholder: "Bekliyor / Odendi / Gecikmis" },
    { key: "description", label: "Aciklama", type: "textarea" },
  ],
  tasks: [
    { key: "title", label: "Baslik", placeholder: "Aksiyon basligi" },
    { key: "owner", label: "Sorumlu", placeholder: "Kisi / ekip" },
    { key: "priority", label: "Oncelik", placeholder: "Yuksek / Orta / Dusuk" },
    { key: "date", label: "Tarih", type: "date" },
    { key: "status", label: "Durum", placeholder: "Acik / Devam / Tamamlandi" },
    { key: "notes", label: "Notlar", type: "textarea" },
  ],
  templates: [
    { key: "industry", label: "Sektor", placeholder: "mimarlik, mermer, danismanlik..." },
    { key: "title", label: "Sablon adi", placeholder: "Haftalik yonetim raporu" },
    { key: "sections", label: "Bolumler", type: "textarea" },
  ],
};

const emptyForm: Record<LegacyEditorModule, Record<string, string>> = {
  customers: { name: "", industry: "", status: "", collectionStatus: "", notes: "" },
  sales: { customer: "", name: "", amount: "", stage: "", expectedCloseDate: "", notes: "" },
  finance: { customer: "", amount: "", dueDate: "", paymentStatus: "", description: "" },
  tasks: { title: "", owner: "", priority: "", date: "", status: "", notes: "" },
  templates: { industry: "", title: "", sections: "" },
};

async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export function MetrixWorkspace({ moduleId }: { moduleId: ModuleId }) {
  const pathname = usePathname();
  const [data, setData] = useState<MetrixWorkspaceData>(blankData);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasChatMounted, setHasChatMounted] = useState(false);
  const currentModule = getModuleMeta(moduleId);

  async function refresh() {
    setData(await readWorkspaceData());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (isChatOpen) setHasChatMounted(true);
  }, [isChatOpen]);

  return (
    <div className="min-h-screen bg-[#120f0b] text-[#f7efe2]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:flex-row">
        <aside className="hidden w-56 shrink-0 border-r border-[#2b2118] bg-[#17120d] px-4 py-6 md:block">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#c69b61]">
            METRIX
          </p>
          <h1 className="mt-2 text-xl font-semibold leading-tight">AI Genel Mudur</h1>

          {/* Primary navigation — 4 items only */}
          <nav className="mt-7 space-y-0.5">
            {primaryNav.map((item) => (
              <Link
                className={`block rounded-md px-3 py-2 text-sm font-semibold transition ${
                  isPrimaryNavActive(item.id, pathname)
                    ? "bg-[#f0dec2] text-[#17120d]"
                    : "text-[#d6c6b2] hover:bg-[#241b13]"
                }`}
                href={item.href}
                key={item.id}
              >
                {item.label}
              </Link>
            ))}
            {/* METRIX — chat action, visually prominent */}
            <button
              className="mt-1 w-full rounded-md bg-[#c69b61]/15 px-3 py-2 text-left text-sm font-black text-[#c69b61] transition hover:bg-[#c69b61]/25"
              onClick={() => setIsChatOpen(true)}
              type="button"
            >
              METRIX ↗
            </button>
          </nav>

          {/* Contextual: company record sub-nav, shown when inside a record module */}
          {companyRecordPaths.has(pathname) && (
            <div className="mt-7 border-t border-[#2b2118] pt-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#5a4a38]">
                Sirket Kayitlari
              </p>
              <nav className="space-y-0.5">
                {companyRecordModules.map((item) => (
                  <Link
                    className={`block rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      pathname === item.href
                        ? "bg-[#241b13] text-[#f0dec2]"
                        : "text-[#8a7a68] hover:bg-[#1e160f] hover:text-[#d6c6b2]"
                    }`}
                    href={item.href}
                    key={item.id}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-8">
          <header className="border-b border-[#2b2118] bg-[#17120d]/95 px-5 py-5 md:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#c69b61]">
              Metrix OS
            </p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold md:text-4xl">{currentModule.label}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b9aa97]">
                  {currentModule.description}
                </p>
              </div>
              <button
                className="hidden rounded-md border border-[#c69b61]/45 px-4 py-2 text-sm font-bold text-[#f0dec2] transition hover:bg-[#241b13] md:block"
                onClick={() => setIsChatOpen(true)}
                type="button"
              >
                Metrix ile konus
              </button>
            </div>
          </header>

          <div className="px-5 py-5 md:px-8 md:py-8">
            {moduleId === "home" ? (
              <HomeView data={data} />
            ) : moduleId === "company" ? (
              <CompanyView data={data} onRefresh={refresh} />
            ) : moduleId === "customers" ? (
              <CustomersWorkspaceView data={data} onRefresh={refresh} />
            ) : moduleId === "offers" ? (
              <OffersWorkspaceView data={data} onRefresh={refresh} />
            ) : isListModule(moduleId) ? (
              <ListTypeView data={data} moduleId={moduleId} onRefresh={refresh} />
            ) : moduleId === "work-plan" ? (
              <WorkPlanView data={data} onRefresh={refresh} />
            ) : moduleId === "accounting" ? (
              <AccountingView data={data} onRefresh={refresh} />
            ) : isAiModule(moduleId) ? (
              <AiExecutiveView data={data} moduleId={moduleId} />
            ) : moduleId === "reports" ? (
              <ReportsView data={data} onRefresh={refresh} />
            ) : (
              <EditorView data={data} moduleId={moduleId as LegacyEditorModule} onRefresh={refresh} />
            )}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav — 4 tabs, METRIX center & elevated */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#33261a] bg-[#17120d] pb-[max(env(safe-area-inset-bottom),6px)] pt-1 md:hidden">
        <div className="flex items-end justify-around px-2">
          {/* Ana Akış */}
          <Link
            className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-black transition ${
              isPrimaryNavActive("home", pathname) ? "text-[#f0dec2]" : "text-[#6a5a48]"
            }`}
            href="/metrix"
          >
            <span className="text-base leading-none">⌂</span>
            <span>Akis</span>
          </Link>

          {/* Şirketim */}
          <Link
            className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-black transition ${
              isPrimaryNavActive("company", pathname) ? "text-[#f0dec2]" : "text-[#6a5a48]"
            }`}
            href="/metrix/company"
          >
            <span className="text-base leading-none">◈</span>
            <span>Sirket</span>
          </Link>

          {/* METRIX — center, elevated, prominent */}
          <button
            aria-label="Metrix ile konus"
            className="relative -top-3 flex flex-col items-center"
            onClick={() => setIsChatOpen(true)}
            type="button"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#c69b61] text-[11px] font-black leading-tight text-[#17120d] shadow-[0_8px_28px_rgba(198,155,97,0.50)]">
              METRIX
            </span>
          </button>

          {/* Raporlar */}
          <Link
            className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-black transition ${
              isPrimaryNavActive("reports", pathname) ? "text-[#f0dec2]" : "text-[#6a5a48]"
            }`}
            href="/metrix/reports"
          >
            <span className="text-base leading-none">≡</span>
            <span>Rapor</span>
          </Link>
        </div>
      </nav>

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
    </div>
  );
}

function getModuleMeta(moduleId: ModuleId): ModuleMeta {
  return modules.find((item) => item.id === moduleId) ?? legacyModuleMeta[moduleId as keyof typeof legacyModuleMeta];
}

function isListModule(moduleId: ModuleId): moduleId is
  | "customers"
  | "products"
  | "collections"
  | "team"
  | "suppliers"
  | "documents"
  | "goals" {
  return [
    "customers",
    "products",
    "collections",
    "team",
    "suppliers",
    "documents",
    "goals",
  ].includes(moduleId);
}

function isAiModule(moduleId: ModuleId): moduleId is "daily-rhythm" | "company-dna" | "opinion" {
  return ["daily-rhythm", "company-dna", "opinion"].includes(moduleId);
}

function HomeView({ data }: { data: MetrixWorkspaceData }) {
  const stats = [
    { label: "Musteri", value: data.customers.length },
    { label: "Teklif", value: data.offers.length },
    { label: "Tahsilat", value: data.collections.length },
    { label: "Acik hedef", value: data.goals.filter((goal) => goal.status !== "Tamamlandi").length },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
        <h3 className="text-xl font-semibold">Bugunku calisma ritmi</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cdbda8]">
          Metrix burada musteri portfoyu, satis, finans, aksiyonlar, raporlar ve sektor sablonlarini
          ayni calisma yuzeyinde birlestirir. Simdilik demo storage kullaniliyor.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((stat) => (
            <div className="rounded-md border border-[#33261a] bg-[#120f0b] p-4" key={stat.label}>
              <p className="text-3xl font-semibold text-[#f0dec2]">{stat.value}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[#9f8a70]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {data.reports.slice(0, 3).map((report) => (
          <ReportBlock report={report} key={report.id} />
        ))}
      </section>
    </div>
  );
}

function CompanyView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<CompanyProfile>(data.companyProfile);

  useEffect(() => {
    setProfile(data.companyProfile);
  }, [data.companyProfile]);

  async function saveProfile() {
    await updateCompanyProfile({
      companyName: profile.companyName,
      industry: profile.industry,
      workingStyle: profile.workingStyle,
      mainGoal: profile.mainGoal,
      notes: profile.notes,
    });
    await onRefresh();
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
        <h3 className="text-xl font-semibold">Sirket profili</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Object.entries(profile)
            .filter(([key]) => key !== "updatedAt")
            .map(([key, value]) => (
            <label className={key === "mainGoal" || key === "notes" ? "md:col-span-2" : ""} key={key}>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9f8a70]">
                {companyFieldLabel(key)}
              </span>
              <textarea
                className="mt-1 min-h-20 w-full resize-none rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 py-2 text-sm leading-6 text-[#f7efe2] outline-none focus:border-[#c69b61]"
                onChange={(event) => setProfile((prev) => ({ ...prev, [key]: event.target.value }))}
                value={String(value)}
              />
            </label>
          ))}
        </div>
        <button
          className="mt-5 rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d]"
          onClick={() => void saveProfile()}
          type="button"
        >
          Sirket profilini kaydet
        </button>
      </div>
      <aside className="rounded-lg border border-[#3a2a1c] bg-[#17120d] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">
          Metrix okuma notu
        </p>
        <p className="mt-3 text-sm leading-6 text-[#cdbda8]">
          Bu sayfa Metrix&apos;in sirketi yorumlarken kullanacagi temel kaynak olacak: sektor,
          calisma duzeni, hedefler ve karar ritmi tek profilde toplanir.
        </p>
      </aside>
    </section>
  );
}

function ListTypeView({
  data,
  moduleId,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  moduleId: Parameters<typeof getListConfig>[1];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo(() => getListConfig(data, moduleId), [data, moduleId]);
  const [rows, setRows] = useState<ListRow[]>(config.rows);
  const [selected, setSelected] = useState<ListRow | null>(config.rows[0] ?? null);

  useEffect(() => {
    setRows(config.rows);
    setSelected(config.rows[0] ?? null);
  }, [config]);

  function openNew() {
    setSelected({
      id: `draft_${Date.now()}`,
      title: "Yeni kayit",
      values: Object.fromEntries(config.columns.map((column) => [column.key, ""])),
    });
  }

  async function saveSelected() {
    if (!selected) return;
    await persistListRow(moduleId, selected);
    await onRefresh();
  }

  async function deleteSelected() {
    if (!selected || selected.id.startsWith("draft_")) return;
    await deleteListRow(moduleId, selected.id);
    setSelected(null);
    await onRefresh();
  }

  return (
    <div className="grid min-h-[620px] gap-5 lg:grid-cols-[1fr_360px]">
      <section className="min-h-0 overflow-hidden rounded-lg border border-[#3a2a1c] bg-[#1b140e]">
        <div className="border-b border-[#33261a] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{config.title}</h3>
            <button
              className="rounded-md bg-[#f0dec2] px-3 py-2 text-xs font-black text-[#17120d]"
              onClick={openNew}
              type="button"
            >
              Yeni kayit
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {config.kpis.map((kpi) => (
              <div className="rounded-md border border-[#33261a] bg-[#120f0b] p-3" key={kpi.label}>
                <p className="text-xl font-semibold text-[#f0dec2]">{kpi.value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9f8a70]">
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid min-w-[720px] grid-cols-4 border-b border-[#33261a] bg-[#120f0b] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#9f8a70]">
          {config.columns.slice(0, 4).map((column) => (
            <span key={column.key}>{column.label}</span>
          ))}
        </div>
        <div className="max-h-[430px] overflow-auto">
          <div className="min-w-[720px]">
            {rows.map((row) => (
              <button
                className={`grid w-full grid-cols-4 border-b border-[#2b2118] px-4 py-4 text-left text-sm transition ${
                  selected?.id === row.id ? "bg-[#241b13]" : "hover:bg-[#20170f]"
                }`}
                key={row.id}
                onClick={() => setSelected(row)}
                type="button"
              >
                {config.columns.slice(0, 4).map((column) => (
                  <span className="truncate pr-4 text-[#d6c6b2]" key={column.key}>
                    {row.values[column.key] || "-"}
                  </span>
                ))}
              </button>
            ))}
          </div>
        </div>
      </section>
      <LegacyDetailPanel
        columns={config.columns}
        onChange={setSelected}
        onDelete={() => void deleteSelected()}
        onSave={saveSelected}
        row={selected}
      />
    </div>
  );
}

function CustomersWorkspaceView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tum durumlar");
  const [collectionFilter, setCollectionFilter] = useState("Tum tahsilatlar");
  const [fullscreenCustomer, setFullscreenCustomer] = useState<MetrixCustomer | null>(null);

  const customers = useMemo(
    () =>
      [...data.customers].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [data.customers],
  );
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !normalizedQuery ||
        customer.name.toLowerCase().includes(normalizedQuery) ||
        customer.industry.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "Tum durumlar" || customer.status === statusFilter;
      const matchesCollection =
        collectionFilter === "Tum tahsilatlar" ||
        customer.collectionStatus === collectionFilter;
      return matchesQuery && matchesStatus && matchesCollection;
    });
  }, [collectionFilter, customers, query, statusFilter]);

  const kpis = useMemo(() => {
    const silentCount = customers.filter(isSilentCustomer).length;
    return [
      { label: "Toplam musteri", value: String(customers.length) },
      { label: "Aktif musteri", value: String(customers.filter((item) => item.status === "Aktif").length) },
      { label: "Tahsilat riski", value: String(customers.filter((item) => isCollectionRisk(item)).length) },
      { label: "Son 30 gun sessiz", value: String(silentCount) },
    ];
  }, [customers]);
  const metrixComment = buildCustomerPortfolioComment(customers);
  const statusOptions = ["Tum durumlar", ...uniqueValues(customers.map((customer) => customer.status))];
  const collectionOptions = [
    "Tum tahsilatlar",
    ...uniqueValues(customers.map((customer) => customer.collectionStatus)),
  ];

  function openNewCustomer() {
    const timestamp = new Date().toISOString();
    setFullscreenCustomer({
      id: `draft_${Date.now()}`,
      name: "",
      industry: "",
      status: "Aktif",
      collectionStatus: "Normal",
      lastContactDate: new Date().toISOString().slice(0, 10),
      riskLevel: "Normal",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async function saveFullscreenCustomer() {
    if (!fullscreenCustomer) return;
    const input: Omit<MetrixCustomer, "id" | "createdAt" | "updatedAt"> = {
      name: fullscreenCustomer.name,
      industry: fullscreenCustomer.industry,
      status: fullscreenCustomer.status,
      collectionStatus: fullscreenCustomer.collectionStatus,
      lastContactDate: fullscreenCustomer.lastContactDate,
      riskLevel: fullscreenCustomer.riskLevel,
      notes: fullscreenCustomer.notes,
    };

    if (fullscreenCustomer.id.startsWith("draft_")) await createCustomer(input);
    else await updateCustomer(fullscreenCustomer.id, input);
    setFullscreenCustomer(null);
    await onRefresh();
  }

  async function deleteFullscreenCustomer() {
    if (!fullscreenCustomer || fullscreenCustomer.id.startsWith("draft_")) return;
    await deleteCustomer(fullscreenCustomer.id);
    setFullscreenCustomer(null);
    await onRefresh();
  }

  if (fullscreenCustomer) {
    return (
      <CustomerFullscreenView
        customer={fullscreenCustomer}
        customers={customers}
        onChange={setFullscreenCustomer}
        onBack={() => setFullscreenCustomer(null)}
        onSave={() => void saveFullscreenCustomer()}
        onDelete={() => void deleteFullscreenCustomer()}
        onNew={openNewCustomer}
      />
    );
  }

  return (
      <section className="min-h-0 overflow-hidden rounded-lg border border-[#233044] bg-[#f7efe2] text-[#151923] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="sticky top-0 z-10 border-b border-[#ded2bf] bg-[#f7efe2]/95 p-4 backdrop-blur">
          <WorkspaceKpiStrip kpis={kpis} />
          <WorkspaceInsight title="Metrix yorumu">{metrixComment}</WorkspaceInsight>
          <WorkspaceToolbar>
            <WorkspaceSearchInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Musteri veya sektor ara"
              value={query}
            />
            <WorkspaceFilterSelect
              onChange={(event) => setStatusFilter(event.target.value)}
              options={statusOptions}
              value={statusFilter}
            />
            <WorkspaceFilterSelect
              onChange={(event) => setCollectionFilter(event.target.value)}
              options={collectionOptions}
              value={collectionFilter}
            />
            <button
              className="h-11 rounded-md bg-[#162235] px-4 text-sm font-black text-[#fffaf0]"
              onClick={openNewCustomer}
              type="button"
            >
              Yeni musteri
            </button>
          </WorkspaceToolbar>
        </div>

        <WorkspaceListHeader
          columns={["Musteri", "Sektor", "Durum", "Tahsilat", "Son temas"]}
          gridClassName="grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.9fr]"
          minWidthClassName="min-w-[780px]"
        />

        <WorkspaceListBody>
          {filteredCustomers.length ? (
            <div className="min-w-[780px]">
              {filteredCustomers.map((customer) => (
                <WorkspaceListRow
                  gridClassName="grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.9fr]"
                  key={customer.id}
                  onClick={() => setFullscreenCustomer(customer)}
                  selected={false}
                >
                  <span className="min-w-0 pr-4">
                    <span className="block truncate text-sm font-semibold text-[#151923]">
                      {customer.name || "Isimsiz musteri"}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#8a7b68]">
                      {customer.riskLevel} risk - {customer.notes || "Not yok"}
                    </span>
                  </span>
                  <span className="truncate pr-4 text-sm font-medium text-[#3a332a]">{customer.industry || "-"}</span>
                  <WorkspaceStatusBadge value={customer.status || "-"} tone="neutral" />
                  <WorkspaceStatusBadge value={customer.collectionStatus || "-"} tone={isCollectionRisk(customer) ? "risk" : "ok"} />
                  <span className="truncate text-sm font-medium text-[#3a332a]">
                    {formatShortDate(customer.lastContactDate)}
                  </span>
                </WorkspaceListRow>
              ))}
            </div>
          ) : (
            <WorkspaceEmptyState
              actionLabel="Ilk musteri"
              description="Filtreleri temizle veya Metrix'in okuyacagi ilk musteri kaydini ekle."
              onAction={openNewCustomer}
              title="Portfoy sessiz."
            />
          )}
        </WorkspaceListBody>
      </section>
  );
}

// ─── Offers Workspace ─────────────────────────────────────────────────────────

function OffersWorkspaceView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tum teklifler");
  const [editorOffer, setEditorOffer] = useState<Offer | null>(null);

  const offers = useMemo(
    () =>
      [...data.offers].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [data.offers],
  );

  const filteredOffers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offers.filter((offer) => {
      const matchQuery =
        !q ||
        offer.customerName.toLowerCase().includes(q) ||
        offer.title.toLowerCase().includes(q) ||
        (offer.offerNo ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "Tum teklifler" || offer.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [offers, query, statusFilter]);

  const kpis = useMemo(() => {
    const totalAmount = offers.reduce((sum, o) => sum + parseFloat(o.amount || "0"), 0);
    const openCount = offers.filter(
      (o) => !["Kazanildi", "Kaybedildi", "Onaylandi"].includes(o.status),
    ).length;
    const hotCount = offers.filter((o) => (o.heatScore ?? 0) >= 60).length;
    return [
      { label: "Toplam teklif", value: String(offers.length) },
      { label: "Acik teklif", value: String(openCount) },
      { label: "Toplam tutar", value: `${Math.round(totalAmount).toLocaleString("tr-TR")} TL` },
      { label: "Sicak teklif", value: String(hotCount) },
    ];
  }, [offers]);

  const metrixComment = buildOffersComment(offers);
  const statusOptions = ["Tum teklifler", ...uniqueValues(offers.map((o) => o.status))];

  function openNewOffer() {
    const timestamp = new Date().toISOString();
    setEditorOffer({
      id: `draft_${Date.now()}`,
      offerNo: `TKL-${new Date().getFullYear()}-${String(offers.length + 1).padStart(3, "0")}`,
      customerName: "",
      title: "Yeni Teklif",
      amount: "0",
      status: "Gorusme",
      expectedCloseDate: "",
      notes: "",
      validityDate: "",
      totalArea: "",
      estimatedDuration: "",
      description: "",
      lineItems: [],
      paymentTerms: "",
      deliveryTerms: "",
      conditions: "",
      viewCount: 0,
      lastViewedAt: "",
      heatScore: 0,
      activityLog: [{ at: timestamp, type: "created", note: "Teklif olusturuldu." }],
      approvedAt: "",
      customerQuestion: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (editorOffer) {
    return (
      <OfferEditor
        offer={editorOffer}
        onBack={() => setEditorOffer(null)}
        onDelete={async () => {
          if (!editorOffer.id.startsWith("draft_")) {
            await deleteOffer(editorOffer.id);
            await onRefresh();
          }
          setEditorOffer(null);
        }}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <section className="min-h-0 overflow-hidden rounded-lg border border-[#233044] bg-[#f7efe2] text-[#151923] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="sticky top-0 z-10 border-b border-[#ded2bf] bg-[#f7efe2]/95 p-4 backdrop-blur">
        <WorkspaceKpiStrip kpis={kpis} />
        <WorkspaceInsight title="Metrix yorumu">{metrixComment}</WorkspaceInsight>
        <WorkspaceToolbar>
          <WorkspaceSearchInput
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Musteri, teklif basligi veya no ara"
            value={query}
          />
          <WorkspaceFilterSelect
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
            value={statusFilter}
          />
          <div />
          <button
            className="h-11 rounded-md bg-[#162235] px-4 text-sm font-black text-[#fffaf0]"
            onClick={openNewOffer}
            type="button"
          >
            Yeni teklif
          </button>
        </WorkspaceToolbar>
      </div>

      <WorkspaceListHeader
        columns={["Musteri / Teklif", "Tutar", "Durum", "Sicaklik", "Kapanis"]}
        gridClassName="grid-cols-[2fr_1fr_0.9fr_0.8fr_0.9fr]"
        minWidthClassName="min-w-[820px]"
      />

      <WorkspaceListBody>
        {filteredOffers.length ? (
          <div className="min-w-[820px]">
            {filteredOffers.map((offer) => (
              <WorkspaceListRow
                gridClassName="grid-cols-[2fr_1fr_0.9fr_0.8fr_0.9fr]"
                key={offer.id}
                onClick={() => setEditorOffer(offer)}
                selected={false}
              >
                <span className="min-w-0 pr-4">
                  <span className="block truncate text-sm font-semibold text-[#151923]">
                    {offer.customerName || "Musterisiz"}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[#8a7b68]">
                    {offer.offerNo ? `${offer.offerNo} · ` : ""}
                    {offer.title}
                  </span>
                </span>
                <span className="truncate pr-4 text-sm font-black text-[#151923]">
                  {parseFloat(offer.amount || "0").toLocaleString("tr-TR")} TL
                </span>
                <WorkspaceStatusBadge value={offer.status || "-"} tone={offerStatusTone(offer.status)} />
                <OfferHeatBadge score={offer.heatScore ?? 0} />
                <span className="truncate text-sm font-medium text-[#3a332a]">
                  {formatShortDate(offer.expectedCloseDate)}
                </span>
              </WorkspaceListRow>
            ))}
          </div>
        ) : (
          <WorkspaceEmptyState
            actionLabel="Ilk teklifi olustur"
            description="Metrix'in okuyacagi ilk teklifi olustur ve portfoyu canlandir."
            onAction={openNewOffer}
            title="Teklif portfoyu bos."
          />
        )}
      </WorkspaceListBody>
    </section>
  );
}

function OfferEditor({
  offer,
  onBack,
  onDelete,
  onRefresh,
}: {
  offer: Offer;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Offer>(offer);
  const [saving, setSaving] = useState(false);
  const [showQuestionInput, setShowQuestionInput] = useState(false);
  const [questionText, setQuestionText] = useState(offer.customerQuestion ?? "");
  const isDraft = draft.id.startsWith("draft_");

  useEffect(() => {
    if (!offer.id.startsWith("draft_")) {
      void trackOfferView(offer.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lineItems = draft.lineItems ?? [];
  const subtotal = lineItems.reduce(
    (sum, item) => sum + parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0"),
    0,
  );
  const vat = subtotal * 0.2;
  const grandTotal = subtotal + vat;

  function setField<K extends keyof Offer>(key: K, value: Offer[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function addLineItem() {
    const newItem: OfferLineItem = {
      id: `li_${Date.now()}`,
      name: "",
      description: "",
      quantity: "1",
      unit: "adet",
      unitPrice: "0",
    };
    setDraft((prev) => ({ ...prev, lineItems: [...(prev.lineItems ?? []), newItem] }));
  }

  function updateLineItem(id: string, changes: Partial<OfferLineItem>) {
    setDraft((prev) => ({
      ...prev,
      lineItems: (prev.lineItems ?? []).map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    }));
  }

  function removeLineItem(id: string) {
    setDraft((prev) => ({
      ...prev,
      lineItems: (prev.lineItems ?? []).filter((item) => item.id !== id),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const input = {
        offerNo: draft.offerNo ?? "",
        customerName: draft.customerName,
        title: draft.title,
        amount: String(Math.round(grandTotal)),
        status: draft.status,
        expectedCloseDate: draft.expectedCloseDate,
        notes: draft.notes,
        validityDate: draft.validityDate ?? "",
        totalArea: draft.totalArea ?? "",
        estimatedDuration: draft.estimatedDuration ?? "",
        description: draft.description ?? "",
        lineItems: draft.lineItems ?? [],
        paymentTerms: draft.paymentTerms ?? "",
        deliveryTerms: draft.deliveryTerms ?? "",
        conditions: draft.conditions ?? "",
        viewCount: draft.viewCount ?? 0,
        lastViewedAt: draft.lastViewedAt ?? "",
        heatScore: draft.heatScore ?? 0,
        activityLog: draft.activityLog ?? [],
        approvedAt: draft.approvedAt ?? "",
        customerQuestion: draft.customerQuestion ?? "",
      };
      if (isDraft) {
        await createOffer(input);
      } else {
        await updateOffer(draft.id, input);
      }
      await onRefresh();
      onBack();
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (isDraft) return;
    await approveOffer(draft.id);
    setDraft((prev) => ({ ...prev, status: "Onaylandi", approvedAt: new Date().toISOString(), heatScore: 100 }));
    await onRefresh();
  }

  async function handleSubmitQuestion() {
    if (!questionText.trim() || isDraft) return;
    await submitOfferQuestion(draft.id, questionText);
    setDraft((prev) => ({ ...prev, customerQuestion: questionText }));
    setShowQuestionInput(false);
    await onRefresh();
  }

  const offerKpis = [
    { label: "Tutar", value: `${Math.round(grandTotal).toLocaleString("tr-TR")} TL` },
    { label: "Durum", value: draft.status || "-" },
    { label: "Sicaklik", value: String(draft.heatScore ?? 0) },
    { label: "Kapanis", value: formatShortDate(draft.expectedCloseDate) },
  ];

  return (
    <RecordFullscreenLayout>
      <RecordHeader
        backLabel="← Teklifler"
        badge={<OfferHeatBadge score={draft.heatScore ?? 0} />}
        isDraft={false}
        onBack={onBack}
        onDelete={() => void onDelete()}
        onSave={() => void save()}
        saveLabel={saving ? "Kaydediliyor..." : "Kaydet"}
        saving={saving}
      />

      <div className="space-y-5 p-5">
        {/* 1. METRIX Analizi */}
        <MetrixInsightCard
          analysis={buildOfferAnalysis(draft)}
          name={draft.title || "Yeni Teklif"}
        />

        {/* 2. KPI */}
        <RecordKpiGrid kpis={offerKpis} />

        {/* 3. Teklif bilgileri */}
        {/* Dark header — editable PDF-style section */}
        <div className="rounded-lg bg-[#101827] p-6 text-[#f7efe2]">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c29354]">
                Metrix OS — Teklif
              </p>
              <input
                className="mt-2 w-full bg-transparent text-2xl font-semibold text-[#f7efe2] outline-none placeholder:text-[#4a5a6f] md:text-3xl"
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Teklif basligini girin"
                value={draft.title}
              />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <OfferHeaderField
                  label="Musteri / Firma"
                  onChange={(v) => setField("customerName", v)}
                  value={draft.customerName}
                />
                <OfferHeaderField
                  label="Teklif No"
                  onChange={(v) => setField("offerNo", v)}
                  value={draft.offerNo ?? ""}
                />
              </div>
            </div>
            <div className="shrink-0 space-y-3">
              <OfferHeaderField
                label="Kapanis / Teklif Tarihi"
                onChange={(v) => setField("expectedCloseDate", v)}
                type="date"
                value={draft.expectedCloseDate}
              />
              <div className="rounded-md bg-[#c29354] px-5 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#17120d]">
                  Genel Toplam
                </p>
                <p className="mt-1 text-xl font-black text-[#17120d]">
                  {Math.round(grandTotal).toLocaleString("tr-TR")} TL
                </p>
                {lineItems.length > 0 && (
                  <p className="mt-1 text-[10px] text-[#17120d]/70">KDV dahil</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-[#26364f] bg-[#162235] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c29354]">Gecerlilik</p>
              <input
                className="mt-1 w-full bg-transparent text-sm font-semibold text-[#f7efe2] outline-none placeholder:text-[#4a5a6f]"
                onChange={(e) => setField("validityDate", e.target.value)}
                placeholder="gg.aa.yyyy"
                type="date"
                value={draft.validityDate ?? ""}
              />
            </div>
            <div className="rounded-md border border-[#26364f] bg-[#162235] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c29354]">Toplam Metraj</p>
              <input
                className="mt-1 w-full bg-transparent text-sm font-semibold text-[#f7efe2] outline-none placeholder:text-[#4a5a6f]"
                onChange={(e) => setField("totalArea", e.target.value)}
                placeholder="Orn. 1.200 m2"
                value={draft.totalArea ?? ""}
              />
            </div>
            <div className="rounded-md border border-[#26364f] bg-[#162235] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c29354]">Tahmini Sure</p>
              <input
                className="mt-1 w-full bg-transparent text-sm font-semibold text-[#f7efe2] outline-none placeholder:text-[#4a5a6f]"
                onChange={(e) => setField("estimatedDuration", e.target.value)}
                placeholder="Orn. 3 ay"
                value={draft.estimatedDuration ?? ""}
              />
            </div>
          </div>
        </div>

        <RecordContentSection title="Aciklama">
          <textarea
            className="min-h-20 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Teklif kapsamini ve amacini aciklayin..."
            value={draft.description ?? ""}
          />
        </RecordContentSection>

        <RecordContentSection title="Teklif Kalemleri">
          <div className="overflow-x-auto rounded-md border border-[#ddcfb9]">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[#ddcfb9] bg-[#f1e7d8]">
                  {["No", "Kalem Adi", "Aciklama", "Miktar", "Birim", "Birim Fiyat (TL)", "Toplam (TL)", ""].map((h) => (
                    <th
                      className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[#7d694e]"
                      key={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => {
                  const rowTotal =
                    parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0");
                  return (
                    <tr
                      className="border-b border-[#ede4d5] bg-white hover:bg-[#fffaf0]"
                      key={item.id}
                    >
                      <td className="px-3 py-3 font-semibold text-[#7d694e]">{idx + 1}</td>
                      <td className="px-3 py-3">
                        <input
                          className="w-full bg-transparent font-semibold text-[#151923] outline-none placeholder:text-[#c9b9a5]"
                          onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                          placeholder="Kalem adi"
                          value={item.name}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="w-full bg-transparent text-[#5a4a38] outline-none placeholder:text-[#c9b9a5]"
                          onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          placeholder="Aciklama"
                          value={item.description}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="w-16 bg-transparent text-right font-semibold text-[#151923] outline-none"
                          onChange={(e) => updateLineItem(item.id, { quantity: e.target.value })}
                          type="number"
                          value={item.quantity}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="w-20 bg-transparent text-[#5a4a38] outline-none placeholder:text-[#c9b9a5]"
                          onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                          placeholder="adet"
                          value={item.unit}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="w-28 bg-transparent text-right font-semibold text-[#151923] outline-none"
                          onChange={(e) => updateLineItem(item.id, { unitPrice: e.target.value })}
                          type="number"
                          value={item.unitPrice}
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-black text-[#151923]">
                        {Math.round(rowTotal).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          className="text-sm font-black text-[#9b2f25] hover:text-[#7a1f17]"
                          onClick={() => removeLineItem(item.id)}
                          type="button"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-[#ddcfb9] bg-[#fffaf0] px-3 py-3">
              <button
                className="text-sm font-black text-[#162235] hover:underline"
                onClick={addLineItem}
                type="button"
              >
                + Kalem ekle
              </button>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-2 rounded-md border border-[#ddcfb9] bg-white p-4">
              <div className="flex justify-between text-sm">
                <span className="text-[#7d694e]">Ara Toplam</span>
                <span className="font-semibold">{Math.round(subtotal).toLocaleString("tr-TR")} TL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#7d694e]">KDV %20</span>
                <span className="font-semibold">{Math.round(vat).toLocaleString("tr-TR")} TL</span>
              </div>
              <div className="flex justify-between border-t border-[#ddcfb9] pt-2">
                <span className="font-black text-[#151923]">Genel Toplam</span>
                <span className="font-black text-[#151923]">
                  {Math.round(grandTotal).toLocaleString("tr-TR")} TL
                </span>
              </div>
            </div>
          </div>
        </RecordContentSection>

        <div className="grid gap-5 md:grid-cols-2">
          <RecordContentSection title="Odeme Kosullari">
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
              onChange={(e) => setField("paymentTerms", e.target.value)}
              placeholder="%30 pesin, kalan 30 gunde..."
              value={draft.paymentTerms ?? ""}
            />
          </RecordContentSection>
          <RecordContentSection title="Teslim / Termin">
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
              onChange={(e) => setField("deliveryTerms", e.target.value)}
              placeholder="Sozlesme tarihinden itibaren..."
              value={draft.deliveryTerms ?? ""}
            />
          </RecordContentSection>
        </div>

        <RecordContentSection title="Sartlar ve Kosullar">
          <textarea
            className="min-h-20 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
            onChange={(e) => setField("conditions", e.target.value)}
            placeholder="Bu teklif gecerlilik tarihine kadar gecerlidir. KDV haric..."
            value={draft.conditions ?? ""}
          />
        </RecordContentSection>

        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          <RecordContentSection title="Durum">
            <select
              className="h-11 w-full rounded-md border border-[#ddcfb9] bg-white px-3 text-sm font-bold text-[#151923] outline-none focus:border-[#a8793d]"
              onChange={(e) => setField("status", e.target.value)}
              value={draft.status}
            >
              {["Gorusme", "Teklif Verildi", "Kazanildi", "Kaybedildi", "Onaylandi"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </RecordContentSection>
          <RecordContentSection title="Ic Not">
            <textarea
              className="min-h-11 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Ic not veya hatirlatma..."
              value={draft.notes}
            />
          </RecordContentSection>
        </div>

        {!isDraft && (
          <div className="rounded-lg border border-[#26364f] bg-[#101827] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c29354]">
              Musteri Aksiyonlari
            </p>
            <p className="mt-2 text-sm leading-6 text-[#8a9aaa]">
              Musteri portali hazirlanana kadar bu aksiyonlar yerel olarak calisir ve teklif geçmisine kaydedilir.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={`rounded-md px-5 py-3 text-sm font-black transition ${
                  draft.approvedAt
                    ? "cursor-default bg-[#1a4a2e] text-[#a3e0b3]"
                    : "bg-[#1a4a2e] text-[#e2f5e8] hover:bg-[#1d5534]"
                }`}
                disabled={!!draft.approvedAt}
                onClick={() => void handleApprove()}
                type="button"
              >
                {draft.approvedAt ? "✓ Onaylandi" : "Onayla"}
              </button>
              <button
                className="rounded-md border border-[#c29354]/40 px-5 py-3 text-sm font-black text-[#f0dec2] hover:bg-[#1d2a38] transition"
                onClick={() => setShowQuestionInput((p) => !p)}
                type="button"
              >
                {showQuestionInput ? "Iptal" : "Soru Sor"}
              </button>
            </div>
            {showQuestionInput && (
              <div className="mt-4 space-y-2">
                <textarea
                  className="w-full resize-none rounded-md border border-[#26364f] bg-[#162235] px-3 py-2 text-sm text-[#f7efe2] outline-none focus:border-[#c29354]"
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Sorunuzu girin..."
                  rows={3}
                  value={questionText}
                />
                <button
                  className="rounded-md bg-[#c29354] px-4 py-2 text-sm font-black text-[#17120d]"
                  onClick={() => void handleSubmitQuestion()}
                  type="button"
                >
                  Soruyu Kaydet
                </button>
              </div>
            )}
            {draft.customerQuestion && (
              <div className="mt-4 rounded-md border border-[#26364f] bg-[#162235] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c29354]">
                  Musteri Sorusu
                </p>
                <p className="mt-1 text-sm text-[#f7efe2]">{draft.customerQuestion}</p>
              </div>
            )}
          </div>
        )}

        {!isDraft && (draft.activityLog ?? []).length > 0 && (
          <RecordContentSection title="Aktivite Gecmisi">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...(draft.activityLog ?? [])].reverse().slice(0, 20).map((entry, idx) => (
                <div className="flex items-start gap-3" key={idx}>
                  <span className="shrink-0 text-xs text-[#9b8571]">
                    {new Date(entry.at).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-sm text-[#3a332a]">{entry.note}</span>
                </div>
              ))}
            </div>
          </RecordContentSection>
        )}
      </div>
    </RecordFullscreenLayout>
  );
}

function OfferHeaderField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a7f]">
        {label}
      </span>
      <input
        className="mt-1 w-full border-b border-[#26364f] bg-transparent pb-1 text-sm font-medium text-[#f7efe2] outline-none placeholder:text-[#4a5a6f] focus:border-[#c29354]"
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        type={type}
        value={value}
      />
    </label>
  );
}

function OfferHeatBadge({ score }: { score: number }) {
  const { label, cls } = heatConfig(score);
  return (
    <span className={`mr-4 inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-black ${cls}`}>
      {label}
    </span>
  );
}

function heatConfig(score: number): { label: string; cls: string } {
  if (score >= 70) {
    return { label: `🔥 ${score}`, cls: "border-[#e8a87c] bg-[#fff4ed] text-[#8b4513]" };
  }
  if (score >= 40) {
    return { label: `↑ ${score}`, cls: "border-[#e3d09a] bg-[#fffbee] text-[#7a6020]" };
  }
  return { label: String(score), cls: "border-[#d8ccb9] bg-[#fffaf0] text-[#7d694e]" };
}

function offerStatusTone(status: string): "neutral" | "ok" | "risk" {
  if (status === "Kazanildi" || status === "Onaylandi") return "ok";
  if (status === "Kaybedildi") return "risk";
  return "neutral";
}

function buildOffersComment(offers: Offer[]): string {
  const hot = offers.filter((o) => (o.heatScore ?? 0) >= 60);
  const open = offers.filter(
    (o) => !["Kazanildi", "Kaybedildi", "Onaylandi"].includes(o.status),
  );
  if (hot.length > 0) {
    const top = [...hot].sort((a, b) => (b.heatScore ?? 0) - (a.heatScore ?? 0))[0];
    return `${top.customerName} teklifi ${top.viewCount ?? 0} kez goruntulendi; sicaklik yukseliyor. ${open.length} acik tekliften ${hot.length} tanesi kritik esige ulasti.`;
  }
  if (open.length > 0) {
    return `${open.length} acik teklif var. Gecerlilik tarihleri dolmadan karar aliciyla temas kur.`;
  }
  if (offers.length > 0) {
    return "Tum teklifler kapandi. Yeni firsat acmak icin musteri portfoyunu gozden gecir.";
  }
  return "Teklif portfoyu bos. Ilk musteri teklifini olustur ve Metrix'in okumaya baslamasini sagla.";
}

// ─── Workspace Shared Primitives ──────────────────────────────────────────────

function WorkspaceKpiStrip({ kpis }: { kpis: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {kpis.map((kpi) => (
        <WorkspaceKpiCard label={kpi.label} key={kpi.label} value={kpi.value} />
      ))}
    </div>
  );
}

function WorkspaceKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfd4c2] bg-[#fffaf0] p-3">
      <p className="text-2xl font-semibold text-[#151923]">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9b7a4d]">
        {label}
      </p>
    </div>
  );
}

function WorkspaceInsight({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mt-3 rounded-md border border-[#ddcfb9] bg-[#fffaf0] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8793d]">
        {title}
      </p>
      <p className="mt-1 text-sm font-medium leading-6 text-[#2c2419]">{children}</p>
    </div>
  );
}

function WorkspaceToolbar({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_180px_auto]">{children}</div>;
}

function WorkspaceSearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  value: string;
}) {
  return (
    <input
      className="h-11 rounded-md border border-[#ddcfb9] bg-white px-3 text-sm font-medium text-[#151923] outline-none placeholder:text-[#a99a88] focus:border-[#a8793d]"
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  );
}

function WorkspaceFilterSelect({
  onChange,
  options,
  value,
}: {
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  options: string[];
  value: string;
}) {
  return (
    <select
      className="h-11 rounded-md border border-[#ddcfb9] bg-white px-3 text-sm font-bold text-[#151923] outline-none focus:border-[#a8793d]"
      onChange={onChange}
      value={value}
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

function WorkspaceListHeader({
  columns,
  gridClassName,
  minWidthClassName,
}: {
  columns: string[];
  gridClassName: string;
  minWidthClassName: string;
}) {
  return (
    <div
      className={`grid ${minWidthClassName} ${gridClassName} border-b border-[#ded2bf] bg-[#f1e7d8] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d694e]`}
    >
      {columns.map((column) => (
        <span key={column}>{column}</span>
      ))}
    </div>
  );
}

function WorkspaceListBody({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[430px] overflow-auto">{children}</div>;
}

function WorkspaceListRow({
  children,
  gridClassName,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  gridClassName: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={`grid w-full ${gridClassName} items-center border-b border-[#e5dac9] px-4 py-4 text-left transition ${
        selected ? "bg-[#fff7e8]" : "bg-[#f7efe2] hover:bg-[#fffaf0]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function WorkspaceEmptyState({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel: string;
  description: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center px-6 text-center">
      <div>
        <p className="text-lg font-semibold text-[#151923]">{title}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[#7d694e]">{description}</p>
        <button
          className="mt-4 rounded-md bg-[#162235] px-4 py-2 text-sm font-black text-[#fffaf0]"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function WorkspaceDetailPanel({
  children,
  empty = false,
}: {
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <aside
      className={`rounded-lg border border-[#26364f] bg-[#101827] p-5 text-[#f7efe2] shadow-[0_24px_80px_rgba(0,0,0,0.24)] ${
        empty ? "text-[#d8cbb8]" : ""
      }`}
    >
      {children}
    </aside>
  );
}

function WorkspaceField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  type?: "text" | "date" | "textarea";
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#938573]">
        {label}
      </span>
      {type === "textarea" ? (
        <textarea
          className="mt-1 min-h-28 w-full resize-none rounded-md border border-[#26364f] bg-[#162235] px-3 py-2 text-sm leading-6 text-[#f7efe2] outline-none focus:border-[#c29354]"
          onChange={onChange}
          value={value}
        />
      ) : (
        <input
          className="mt-1 h-11 w-full rounded-md border border-[#26364f] bg-[#162235] px-3 text-sm font-medium text-[#f7efe2] outline-none focus:border-[#c29354]"
          onChange={onChange}
          type={type}
          value={value}
        />
      )}
    </label>
  );
}

function WorkspaceStatusBadge({ value, tone }: { value: string; tone: "neutral" | "risk" | "ok" }) {
  const toneClass =
    tone === "risk"
      ? "border-[#e3a9a2] bg-[#fff1ee] text-[#9b2f25]"
      : tone === "ok"
        ? "border-[#c8dac2] bg-[#f1f8ed] text-[#3c6b32]"
        : "border-[#d8ccb9] bg-[#fffaf0] text-[#5f513f]";

  return (
    <span className={`mr-4 inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-black ${toneClass}`}>
      {value}
    </span>
  );
}

// ─── Record Experience Shared Primitives ─────────────────────────────────────
// Reusable full-screen record layout components.
// Customers uses these now; Offers and Work Plan can adopt in future phases.

function RecordFullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#233044] bg-[#f7efe2] text-[#151923] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      {children}
    </div>
  );
}

function RecordHeader({
  backLabel,
  badge,
  isDraft,
  onBack,
  onDelete,
  onNew,
  onSave,
  saveLabel = "Kaydet",
  saving = false,
}: {
  backLabel: string;
  badge?: React.ReactNode;
  isDraft: boolean;
  onBack: () => void;
  onDelete?: () => void;
  onNew?: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#ded2bf] bg-[#f7efe2]/95 px-5 py-3">
      <button
        className="text-sm font-bold text-[#7d694e] hover:text-[#151923]"
        onClick={onBack}
        type="button"
      >
        {backLabel}
      </button>
      <div className="flex items-center gap-2">
        {badge}
        {!isDraft && onDelete && (
          <button
            className="rounded-md border border-[#e5d8c5] px-3 py-2 text-xs font-black text-[#9b2f25] hover:bg-[#fff1ee]"
            onClick={onDelete}
            type="button"
          >
            Sil
          </button>
        )}
        {onNew && (
          <button
            className="rounded-md border border-[#ddcfb9] px-3 py-2 text-xs font-black text-[#5a4a38] hover:bg-[#fffaf0]"
            onClick={onNew}
            type="button"
          >
            Yeni
          </button>
        )}
        <button
          className="rounded-md bg-[#162235] px-4 py-2 text-sm font-black text-[#fffaf0] disabled:opacity-50"
          disabled={saving}
          onClick={onSave}
          type="button"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function MetrixInsightCard({ analysis, name }: { analysis: string; name: string }) {
  return (
    <div className="rounded-lg bg-[#101827] p-5 text-[#f7efe2]">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#c29354]">
        Metrix Analizi
      </p>
      <h3 className="mt-3 text-xl font-semibold">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-[#cdbda8]">{analysis}</p>
    </div>
  );
}

function RecordKpiGrid({ kpis }: { kpis: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((kpi) => (
        <div className="rounded-md border border-[#dfd4c2] bg-[#fffaf0] p-3" key={kpi.label}>
          <p className="text-lg font-semibold text-[#151923]">{kpi.value}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9b7a4d]">
            {kpi.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecordContentSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[#ded2bf] bg-white p-5">
      <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#7d694e]">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CustomerFullscreenView({
  customer,
  customers,
  onChange,
  onBack,
  onSave,
  onDelete,
  onNew,
}: {
  customer: MetrixCustomer;
  customers: MetrixCustomer[];
  onChange: (c: MetrixCustomer) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onNew: () => void;
}) {
  const isDraft = customer.id.startsWith("draft_");

  const metrixAnalysis = buildCustomerAnalysis(customer, customers);

  const kpis = [
    { label: "Durum", value: customer.status || "-" },
    { label: "Tahsilat", value: customer.collectionStatus || "-" },
    { label: "Risk", value: customer.riskLevel || "-" },
    { label: "Son temas", value: formatShortDate(customer.lastContactDate) },
  ];

  const fields: Array<{ key: keyof MetrixCustomer; label: string; type?: "date" | "textarea" }> = [
    { key: "name", label: "Musteri adi" },
    { key: "industry", label: "Sektor" },
    { key: "status", label: "Durum" },
    { key: "collectionStatus", label: "Tahsilat durumu" },
    { key: "lastContactDate", label: "Son temas tarihi", type: "date" },
    { key: "riskLevel", label: "Risk seviyesi" },
    { key: "notes", label: "Notlar", type: "textarea" },
  ];

  const textFields = fields.filter((f) => f.type !== "textarea");
  const textareaFields = fields.filter((f) => f.type === "textarea");

  return (
    <RecordFullscreenLayout>
      <RecordHeader
        backLabel="← Musteriler"
        isDraft={isDraft}
        onBack={onBack}
        onDelete={onDelete}
        onNew={onNew}
        onSave={onSave}
      />
      <div className="space-y-5 p-5">
        <MetrixInsightCard
          analysis={metrixAnalysis}
          name={customer.name || "Yeni musteri"}
        />
        <RecordKpiGrid kpis={kpis} />
        <RecordContentSection title="Kayit bilgileri">
          <div className="grid gap-4 md:grid-cols-2">
            {textFields.map((field) => (
              <label className="block" key={field.key}>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7a4d]">
                  {field.label}
                </span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 text-sm font-medium text-[#151923] outline-none focus:border-[#a8793d]"
                  onChange={(e) => onChange({ ...customer, [field.key]: e.target.value })}
                  type={field.type === "date" ? "date" : "text"}
                  value={String(customer[field.key] ?? "")}
                />
              </label>
            ))}
          </div>
          {textareaFields.map((field) => (
            <label className="mt-4 block" key={field.key}>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7a4d]">
                {field.label}
              </span>
              <textarea
                className="mt-1 min-h-28 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
                onChange={(e) => onChange({ ...customer, [field.key]: e.target.value })}
                value={String(customer[field.key] ?? "")}
              />
            </label>
          ))}
        </RecordContentSection>
      </div>
    </RecordFullscreenLayout>
  );
}

function isCollectionRisk(customer: MetrixCustomer): boolean {
  const value = customer.collectionStatus.toLowerCase();
  return value.includes("gec") || value.includes("risk") || value.includes("takip");
}

function isSilentCustomer(customer: MetrixCustomer): boolean {
  if (!customer.lastContactDate) return true;
  const lastContact = new Date(customer.lastContactDate).getTime();
  if (Number.isNaN(lastContact)) return true;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - lastContact > thirtyDaysMs;
}

function buildCustomerPortfolioComment(customers: MetrixCustomer[]): string {
  const collectionRisk = customers.filter(isCollectionRisk).length;
  const silent = customers.filter(isSilentCustomer).length;
  if (collectionRisk > 0) {
    return "Bugun once tahsilat riski olan musterilere odaklan. Sessiz kalan portfoyu ikinci siraya al.";
  }
  if (silent > 0) {
    return "Tahsilat baskisi dusuk gorunuyor; son 30 gundur sessiz kalan musterilere temas ac.";
  }
  return "Portfoy dengeli gorunuyor. Bugun sicak musteriler ve teklif bekleyen hesaplar oncelikli.";
}

function buildWorkPlanItemAnalysis(item: WorkPlanItem, allItems: WorkPlanItem[]): string {
  if (isOverdueWorkPlanItem(item)) {
    return "Bu is gecikti. Tarih ve durum guncellenmeli; gerekirse iptal edilmeli.";
  }
  const workload = parseInt(item.workloadPercent || "0", 10);
  const sameDayItems = allItems.filter((i) => i.date === item.date && i.id !== item.id);
  if (workload >= 80) {
    return `Yogunluk yuksek (%${workload}). ${sameDayItems.length > 0 ? `Ayni gun ${sameDayItems.length} diger is var; kapasite asimi riski.` : "Ekstra is eklenmemesi oneriliyor."}`;
  }
  if (sameDayItems.length > 0) {
    const totalDayLoad = allItems
      .filter((i) => i.date === item.date)
      .reduce((sum, i) => sum + parseInt(i.workloadPercent || "0", 10), 0);
    return `Ayni gun toplam yogunluk %${totalDayLoad}. ${totalDayLoad > 100 ? "Gunu yeniden planlamayi dusun." : "Kapasite dengeli gorunuyor."}`;
  }
  return `${item.title || "Bu is"} ${item.status} asamasinda. ${item.startTime}–${item.endTime} araliginda planlandi.`;
}

function buildOfferAnalysis(offer: Offer): string {
  const score = offer.heatScore ?? 0;
  if (offer.status === "Onaylandi") {
    return "Teklif onaylandi. Teslimat ve tahsilat sureci takip edilmeli.";
  }
  if (offer.status === "Kaybedildi") {
    return "Teklif kaybedildi. Sebepler not edilmeli; benzer firsatlar icin ders cikarilmali.";
  }
  if (score >= 70) {
    return `Sicaklik yuksek (${score}). ${offer.customerName || "Musteri"} karar asamasinda; hizli kapanis icin hazirlan.`;
  }
  if (score >= 40) {
    return `Teklif ilgi gorüyor (sicaklik ${score}). Takip cagrisi planlaman oneriliyor.`;
  }
  const totalAmount = parseFloat(offer.amount || "0");
  if (totalAmount > 0) {
    return `${totalAmount.toLocaleString("tr-TR")} TL degerinde teklif ${offer.status} asamasinda. Gecerlilik tarihine dikkat et.`;
  }
  return "Yeni teklif olusturuluyor. Musteri adi, tutar ve kapanis tarihini girerek baslayabilirsin.";
}

function buildCustomerAnalysis(customer: MetrixCustomer, allCustomers: MetrixCustomer[]): string {
  const parts: string[] = [];
  if (isCollectionRisk(customer)) {
    parts.push(`Tahsilat riski tespit edildi: ${customer.collectionStatus}.`);
  }
  if (isSilentCustomer(customer)) {
    parts.push("Son 30 gunde temas kaydedilmemis.");
  }
  if (customer.riskLevel && customer.riskLevel.toLowerCase() !== "normal") {
    parts.push(`Risk seviyesi "${customer.riskLevel}" olarak isaretlendi.`);
  }
  if (parts.length === 0) {
    const industryPeers = allCustomers.filter(
      (c) => c.industry === customer.industry && c.id !== customer.id,
    ).length;
    if (industryPeers > 0) {
      return `${customer.name || "Bu musteri"} dengeli gorunuyor. Ayni sektorde ${industryPeers} diger musteri var; karsilastirmali takip oneriliyor.`;
    }
    return `${customer.name || "Bu musteri"} portfoy acidan dengeli gorunuyor. Aktif temas surdurulebilir.`;
  }
  return parts.join(" ");
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatShortDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function LegacyDetailPanel({
  row,
  columns,
  onChange,
  onDelete,
  onSave,
}: {
  row: ListRow | null;
  columns: ListConfig["columns"];
  onChange: (row: ListRow) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-[#3a2a1c] bg-[#17120d] p-5 text-sm text-[#b9aa97]">
        Detay paneli icin bir satir sec.
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-[#3a2a1c] bg-[#17120d] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">
        Detay / edit
      </p>
      <input
        className="mt-3 h-11 w-full rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 text-sm font-semibold text-[#f7efe2] outline-none focus:border-[#c69b61]"
        onChange={(event) => onChange({ ...row, title: event.target.value })}
        value={row.title}
      />
      <div className="mt-4 space-y-3">
        {columns.map((column) => (
          <label className="block" key={column.key}>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9f8a70]">
              {column.label}
            </span>
            <textarea
              className="mt-1 min-h-14 w-full resize-none rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 py-2 text-sm text-[#f7efe2] outline-none focus:border-[#c69b61]"
              onChange={(event) =>
                onChange({
                  ...row,
                  values: { ...row.values, [column.key]: event.target.value },
                })
              }
              value={row.values[column.key] ?? ""}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          className="rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d]"
          onClick={onSave}
          type="button"
        >
          Panelde kaydet
        </button>
        <button
          className="rounded-md border border-[#7f312d] px-4 py-2 text-sm font-black text-[#ffb7ac]"
          onClick={onDelete}
          type="button"
        >
          Sil
        </button>
      </div>
    </aside>
  );
}

function WorkPlanView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("week");
  const [fullscreenItem, setFullscreenItem] = useState<WorkPlanItem | null>(null);
  const sortedItems = useMemo(() => sortWorkPlanByDate(data.workPlan), [data.workPlan]);
  const todayItems = useMemo(() => filterWorkPlanByRange(data.workPlan, "day"), [data.workPlan]);
  const weekItems = useMemo(() => filterWorkPlanByRange(data.workPlan, "week"), [data.workPlan]);
  const monthItems = useMemo(() => filterWorkPlanByRange(data.workPlan, "month"), [data.workPlan]);
  const kpis = [
    { label: "Bugunku yogunluk", value: `%${averageWorkload(todayItems)}` },
    { label: "Bu haftaki yogunluk", value: `%${averageWorkload(weekItems)}` },
    { label: "Geciken isler", value: String(data.workPlan.filter(isOverdueWorkPlanItem).length) },
    { label: "Yaklasan isler", value: String(weekItems.filter((item) => !isOverdueWorkPlanItem(item)).length) },
  ];
  const metrixComment = buildWorkPlanComment(data.workPlan);

  function openNewWorkPlanItem() {
    const timestamp = new Date().toISOString();
    setFullscreenItem({
      id: `draft_${Date.now()}`,
      title: "Yeni is",
      date: "2026-07-01",
      startTime: "09:00",
      endTime: "10:00",
      workloadPercent: "25",
      status: "Planlandi",
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async function saveWorkPlanItem() {
    if (!fullscreenItem) return;
    const input: Omit<WorkPlanItem, "id" | "createdAt" | "updatedAt"> = {
      title: fullscreenItem.title,
      date: fullscreenItem.date,
      startTime: fullscreenItem.startTime,
      endTime: fullscreenItem.endTime,
      workloadPercent: fullscreenItem.workloadPercent,
      status: fullscreenItem.status,
      notes: fullscreenItem.notes,
    };
    if (fullscreenItem.id.startsWith("draft_")) await createWorkPlanItem(input);
    else await updateWorkPlanItem(fullscreenItem.id, input);
    setFullscreenItem(null);
    await onRefresh();
  }

  async function removeWorkPlanItem() {
    if (!fullscreenItem || fullscreenItem.id.startsWith("draft_")) return;
    await deleteWorkPlanItem(fullscreenItem.id);
    setFullscreenItem(null);
    await onRefresh();
  }

  if (fullscreenItem) {
    return (
      <WorkPlanFullscreenView
        allItems={data.workPlan}
        item={fullscreenItem}
        onChange={setFullscreenItem}
        onBack={() => setFullscreenItem(null)}
        onSave={() => void saveWorkPlanItem()}
        onDelete={() => void removeWorkPlanItem()}
        onNew={openNewWorkPlanItem}
      />
    );
  }

  return (
      <section className="min-h-0 overflow-hidden rounded-lg border border-[#233044] bg-[#f7efe2] text-[#151923] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="sticky top-0 z-10 border-b border-[#ded2bf] bg-[#f7efe2]/95 p-4 backdrop-blur">
          <WorkspaceKpiStrip kpis={kpis} />
          <WorkspaceInsight title="Metrix yorumu">{metrixComment}</WorkspaceInsight>
          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex rounded-md border border-[#ddcfb9] bg-white p-1">
              {(["list", "calendar"] as const).map((item) => (
                <button
                  className={`rounded px-3 py-2 text-xs font-black ${
                    mode === item ? "bg-[#162235] text-[#fffaf0]" : "text-[#6f604c]"
                  }`}
                  key={item}
                  onClick={() => setMode(item)}
                  type="button"
                >
                  {item === "list" ? "LISTE" : "TAKVIM"}
                </button>
              ))}
            </div>
            {mode === "calendar" ? (
              <div className="flex rounded-md border border-[#ddcfb9] bg-white p-1">
                {(["day", "week", "month"] as const).map((item) => (
                  <button
                    className={`rounded px-3 py-2 text-xs font-black ${
                      calendarView === item ? "bg-[#f1dfbd] text-[#151923]" : "text-[#6f604c]"
                    }`}
                    key={item}
                    onClick={() => setCalendarView(item)}
                    type="button"
                  >
                    {workPlanViewLabel(item)}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              className="h-10 rounded-md bg-[#162235] px-4 text-sm font-black text-[#fffaf0]"
              onClick={openNewWorkPlanItem}
              type="button"
            >
              Yeni is
            </button>
          </div>
        </div>

        {mode === "list" ? (
          <>
            <WorkspaceListHeader
              columns={["Is", "Tarih", "Saat", "Yogunluk", "Durum"]}
              gridClassName="grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.8fr]"
              minWidthClassName="min-w-[780px]"
            />
            <WorkspaceListBody>
              {sortedItems.length ? (
                <div className="min-w-[780px]">
                  {sortedItems.map((item) => (
                    <WorkspaceListRow
                      gridClassName="grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_0.8fr]"
                      key={item.id}
                      onClick={() => setFullscreenItem(item)}
                      selected={false}
                    >
                      <span className="min-w-0 pr-4">
                        <span className="block truncate text-sm font-semibold text-[#151923]">
                          {item.title || "Isimsiz is"}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#8a7b68]">
                          {item.notes || "Not yok"}
                        </span>
                      </span>
                      <span className="truncate pr-4 text-sm font-medium text-[#3a332a]">
                        {formatShortDate(item.date)}
                      </span>
                      <span className="truncate pr-4 text-sm font-medium text-[#3a332a]">
                        {item.startTime} - {item.endTime}
                      </span>
                      <span className="truncate pr-4 text-sm font-black text-[#3a332a]">
                        %{item.workloadPercent || "0"}
                      </span>
                      <WorkspaceStatusBadge
                        value={item.status || "-"}
                        tone={isOverdueWorkPlanItem(item) ? "risk" : "neutral"}
                      />
                    </WorkspaceListRow>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState
                  actionLabel="Ilk isi ekle"
                  description="Metrix'in okuyacagi ilk is planini ekle."
                  onAction={openNewWorkPlanItem}
                  title="Is plani bos."
                />
              )}
            </WorkspaceListBody>
          </>
        ) : (
          <WorkPlanCalendar
            items={calendarView === "day" ? todayItems : calendarView === "week" ? weekItems : monthItems}
            onSelect={setFullscreenItem}
            selectedId={null}
            view={calendarView}
          />
        )}
      </section>
  );
}

function WorkPlanCalendar({
  items,
  onSelect,
  selectedId,
  view,
}: {
  items: WorkPlanItem[];
  onSelect: (item: WorkPlanItem) => void;
  selectedId: string | null;
  view: "day" | "week" | "month";
}) {
  const buckets = buildCalendarBuckets(items, view);

  return (
    <div className="p-4">
      <div className={`grid gap-2 ${view === "day" ? "grid-cols-1" : view === "week" ? "md:grid-cols-7" : "grid-cols-2 md:grid-cols-7"}`}>
        {buckets.map((bucket) => (
          <div
            className="min-h-40 rounded-md border border-[#ded2bf] bg-[#fffaf0] p-3"
            key={bucket.label}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-[#151923]">{bucket.label}</p>
              <span className="rounded-full bg-[#f1e7d8] px-2 py-1 text-[11px] font-black text-[#8a6537]">
                %{averageWorkload(bucket.items)}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {bucket.items.map((item) => (
                <button
                  className={`w-full rounded-md border p-2 text-left transition ${
                    selectedId === item.id
                      ? "border-[#b9853f] bg-[#f6dfbd]"
                      : "border-[#e3d7c5] bg-white hover:bg-[#fff7e8]"
                  }`}
                  key={item.id}
                  onClick={() => onSelect(item)}
                  type="button"
                >
                  <p className="truncate text-xs font-black text-[#151923]">{item.title}</p>
                  <p className="mt-1 text-[11px] font-medium text-[#6f604c]">
                    {item.startTime} - {item.endTime} / %{item.workloadPercent}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkPlanFullscreenView({
  allItems,
  item,
  onChange,
  onBack,
  onSave,
  onDelete,
  onNew,
}: {
  allItems: WorkPlanItem[];
  item: WorkPlanItem;
  onChange: (item: WorkPlanItem) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onNew: () => void;
}) {
  const isDraft = item.id.startsWith("draft_");

  const kpis = [
    { label: "Tarih", value: formatShortDate(item.date) },
    { label: "Saat", value: item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : "-" },
    { label: "Yogunluk", value: `%${item.workloadPercent || "0"}` },
    { label: "Durum", value: item.status || "-" },
  ];

  const fields: Array<{ key: keyof WorkPlanItem; label: string; type?: "date" | "textarea" }> = [
    { key: "title", label: "Is basligi" },
    { key: "date", label: "Tarih", type: "date" },
    { key: "startTime", label: "Baslangic saati" },
    { key: "endTime", label: "Bitis saati" },
    { key: "workloadPercent", label: "Yogunluk (%)" },
    { key: "status", label: "Durum" },
    { key: "notes", label: "Notlar", type: "textarea" },
  ];

  const textFields = fields.filter((f) => f.type !== "textarea");
  const textareaFields = fields.filter((f) => f.type === "textarea");

  return (
    <RecordFullscreenLayout>
      <RecordHeader
        backLabel="← Is Plani"
        isDraft={isDraft}
        onBack={onBack}
        onDelete={onDelete}
        onNew={onNew}
        onSave={onSave}
      />
      <div className="space-y-5 p-5">
        <MetrixInsightCard
          analysis={buildWorkPlanItemAnalysis(item, allItems)}
          name={item.title || "Yeni is"}
        />
        <RecordKpiGrid kpis={kpis} />
        <RecordContentSection title="Gorev bilgileri">
          <div className="grid gap-4 md:grid-cols-2">
            {textFields.map((field) => (
              <label className="block" key={field.key}>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7a4d]">
                  {field.label}
                </span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 text-sm font-medium text-[#151923] outline-none focus:border-[#a8793d]"
                  onChange={(e) => onChange({ ...item, [field.key]: e.target.value })}
                  type={field.type === "date" ? "date" : "text"}
                  value={String(item[field.key] ?? "")}
                />
              </label>
            ))}
          </div>
          {textareaFields.map((field) => (
            <label className="mt-4 block" key={field.key}>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b7a4d]">
                {field.label}
              </span>
              <textarea
                className="mt-1 min-h-28 w-full resize-none rounded-md border border-[#ddcfb9] bg-[#faf6f0] px-3 py-2 text-sm leading-6 text-[#151923] outline-none focus:border-[#a8793d]"
                onChange={(e) => onChange({ ...item, [field.key]: e.target.value })}
                value={String(item[field.key] ?? "")}
              />
            </label>
          ))}
        </RecordContentSection>
      </div>
    </RecordFullscreenLayout>
  );
}

function AccountingView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<AccountingProfile>(data.accountingProfile);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);

  useEffect(() => {
    setProfile(data.accountingProfile);
  }, [data.accountingProfile]);

  useEffect(() => {
    void fetch("/api/integrations/gmail/status", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as ApiResponse<GmailStatus>;
        if (!result.ok) throw new Error(result.error.message);
        setGmailStatus(result.data);
      })
      .catch(() => setGmailError("Gmail bağlantı durumu alınamadı."));
  }, []);

  async function connectGmailAccount() {
    setGmailBusy(true);
    setGmailError(null);
    try {
      const response = await fetch("/api/integrations/gmail/connect", { method: "POST", credentials: "include" });
      const result = await response.json() as ApiResponse<{ authorizationUrl: string }>;
      if (!result.ok) throw new Error(result.error.message);
      window.location.assign(result.data.authorizationUrl);
    } catch {
      setGmailError("Gmail bağlantısı başlatılamadı.");
      setGmailBusy(false);
    }
  }

  async function disconnectGmailAccount() {
    setGmailBusy(true);
    setGmailError(null);
    try {
      const response = await fetch("/api/integrations/gmail/disconnect", { method: "DELETE", credentials: "include" });
      const result = await response.json() as ApiResponse<{ disconnected: boolean }>;
      if (!result.ok) throw new Error(result.error.message);
      setGmailStatus({ connected: false, providerEmail: null, readOnly: true, status: "NOT_CONNECTED", lastSuccessfulAccessAt: null, lastErrorCode: null });
    } catch {
      setGmailError("Gmail bağlantısı kaldırılamadı.");
    } finally {
      setGmailBusy(false);
    }
  }

  async function saveProfile() {
    await updateAccountingProfile({
      accountantName: profile.accountantName,
      contact: profile.contact,
      integrationStatus: profile.integrationStatus,
      notes: profile.notes,
    });
    await onRefresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5 lg:col-span-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">Gmail · yalnızca okuma</p>
            <h3 className="mt-2 text-lg font-semibold">
              {gmailStatus?.connected ? gmailStatus.providerEmail ?? "Gmail bağlı" : gmailStatus?.status === "RECONNECT_REQUIRED" ? "Gmail yeniden bağlanmalı" : "Gmail bağlı değil"}
            </h3>
            <p className="mt-1 text-sm text-[#cdbda8]">
              {gmailStatus?.connected ? `METRIX e-postaları yalnızca açık isteğinizde okuyabilir.${gmailStatus.lastSuccessfulAccessAt ? ` Son erişim: ${new Date(gmailStatus.lastSuccessfulAccessAt).toLocaleString("tr-TR")}` : ""}` : "E-posta gönderme, taslak ve posta kutusu değişikliği yetkisi istenmez."}
            </p>
            {gmailError ? <p className="mt-2 text-sm text-[#f0a39a]">{gmailError}</p> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {gmailStatus?.connected ? <button className="min-h-11 rounded-md border border-[#80664a] px-4 py-2 text-sm font-bold text-[#f0dec2] disabled:opacity-60" disabled={gmailBusy} onClick={() => void disconnectGmailAccount()} type="button">Bağlantıyı kaldır</button> : null}
            <button className="min-h-11 rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d] disabled:opacity-60" disabled={gmailBusy} onClick={() => void connectGmailAccount()} type="button">
              {gmailBusy ? "İşleniyor…" : gmailStatus?.connected ? "Gmail'i yeniden bağla" : "Gmail'i bağla"}
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
        <h3 className="text-xl font-semibold">Muhasebe ve entegrasyonlar</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Object.entries(profile)
            .filter(([key]) => key !== "updatedAt")
            .map(([key, value]) => (
              <label className={key === "notes" ? "md:col-span-2" : ""} key={key}>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9f8a70]">
                  {accountingFieldLabel(key)}
                </span>
                <textarea
                  className="mt-1 min-h-20 w-full resize-none rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 py-2 text-sm leading-6 text-[#f7efe2] outline-none focus:border-[#c69b61]"
                  onChange={(event) => setProfile((prev) => ({ ...prev, [key]: event.target.value }))}
                  value={String(value)}
                />
              </label>
            ))}
        </div>
        <button
          className="mt-5 rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d]"
          onClick={() => void saveProfile()}
          type="button"
        >
          Muhasebe profilini kaydet
        </button>
      </section>
      <aside className="rounded-lg border border-[#3a2a1c] bg-[#17120d] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">
          Aktarim niyeti
        </p>
        <p className="mt-3 text-sm leading-6 text-[#cdbda8]">
          Bu sayfa Metrix&apos;in muhasebe durumunu, eksik evragi ve aktarim riskini izleyecegi
          entegrasyon yuzeyi olarak tasarlandi.
        </p>
      </aside>
    </div>
  );
}

function AiExecutiveView({
  data,
  moduleId,
}: {
  data: MetrixWorkspaceData;
  moduleId: "daily-rhythm" | "company-dna" | "opinion";
}) {
  const content = {
    "daily-rhythm": {
      title: "Bugunun ritmi",
      sections: [
        ["Sabah brifingi", "Tahsilat riski ve teklif kapanisi bugunun ana sinyalleri."],
        ["Iki odak", "Arel Mermer tahsilati ve Nova Mimarlik karar toplantisi."],
        ["Kapanis", "Gun sonunda acik aksiyonlar ve tahsilat temasi kontrol edilecek."],
      ],
    },
    "company-dna": {
      title: "Company DNA okuma alani",
      sections: [
        ["Calisma tarzi", "Kurucu odakli, hizli karar alan ama takip disiplini isteyen yapi."],
        ["Riskler", "Tahsilat gecikmesi ve teklif takip bosluklari performansi etkiliyor."],
        ["Karar hafizasi", `${data.reports.length} rapor ve ${data.goals.length} hedef sinyali okunuyor.`],
      ],
    },
    opinion: {
      title: "Metrix gorusu",
      sections: [
        ["Oncelik", "Nakit etkisi olan isler satis firsatlarindan once gorulmeli."],
        ["Risk", "Gecikmis tahsilat tekrar eden davranisa donusmeden kapatilmali."],
        ["Oneri", "Haftalik teklif ve tahsilat ritmi ayni takvim ekraninda birlestirilmeli."],
      ],
    },
  }[moduleId];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
        <h3 className="text-2xl font-semibold">{content.title}</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cdbda8]">
          Bu ekran liste degil; Metrix&apos;in sirketi yorumladigi, karar ve oneriyi yuzeye
          cikardigi yonetici formatidir.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {content.sections.map(([title, body]) => (
          <article className="rounded-lg border border-[#3a2a1c] bg-[#17120d] p-5" key={title}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">
              {title}
            </p>
            <p className="mt-3 text-sm leading-6 text-[#d6c6b2]">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function companyFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    companyName: "Sirket adi",
    industry: "Sektor",
    workingStyle: "Calisma tarzi",
    mainGoal: "Ana hedef",
    notes: "Notlar",
  };
  return labels[key] ?? key;
}

function accountingFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    accountantName: "Muhasebeci",
    contact: "Iletisim",
    integrationStatus: "Entegrasyon durumu",
    notes: "Notlar",
  };
  return labels[key] ?? key;
}

function averageWorkload(items: WorkPlanItem[]): number {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + Number(item.workloadPercent || 0), 0);
  return Math.round(total / items.length);
}

function sortWorkPlanByDate(items: WorkPlanItem[]): WorkPlanItem[] {
  const nowTime = startOfToday().getTime();
  return [...items].sort((a, b) => {
    const aTime = parseWorkPlanDate(a).getTime();
    const bTime = parseWorkPlanDate(b).getTime();
    const aPast = aTime < nowTime;
    const bPast = bTime < nowTime;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aTime - bTime;
  });
}

function isOverdueWorkPlanItem(item: WorkPlanItem): boolean {
  return parseWorkPlanDate(item).getTime() < startOfToday().getTime() && item.status !== "Tamamlandi";
}

function filterWorkPlanByRange(items: WorkPlanItem[], range: "day" | "week" | "month"): WorkPlanItem[] {
  const start = startOfToday();
  const end = new Date(start);
  if (range === "day") end.setDate(start.getDate() + 1);
  if (range === "week") end.setDate(start.getDate() + 7);
  if (range === "month") end.setDate(start.getDate() + 30);

  return items.filter((item) => {
    const time = parseWorkPlanDate(item).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
}

function buildWorkPlanComment(items: WorkPlanItem[]): string {
  const weekItems = filterWorkPlanByRange(items, "week");
  const weeklyWorkload = averageWorkload(weekItems);
  const busiest = findBusiestWorkPlanDay(weekItems);
  if (!items.length) return "Is plani bos. Metrix'in okuyabilmesi icin bugunun ilk isini ekle.";
  if (weeklyWorkload >= 75) {
    return `Bu hafta yogunluk %${weeklyWorkload}. ${busiest} en sikisik gun gorunuyor.`;
  }
  if (items.some(isOverdueWorkPlanItem)) {
    return "Geciken isler var. Bugun once gecikenleri kapatmak daha saglikli gorunuyor.";
  }
  return `Bu hafta yogunluk %${weeklyWorkload}. Is plani dengeli, yakin tarihli isleri onde tut.`;
}

function findBusiestWorkPlanDay(items: WorkPlanItem[]): string {
  if (!items.length) return "Bu hafta";
  const byDay = items.reduce<Record<string, number>>((acc, item) => {
    const label = formatWeekday(item.date);
    acc[label] = (acc[label] ?? 0) + Number(item.workloadPercent || 0);
    return acc;
  }, {});
  return Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Bu hafta";
}

function buildCalendarBuckets(items: WorkPlanItem[], view: "day" | "week" | "month") {
  if (view === "day") {
    return [{ label: "Bugun", items: sortWorkPlanByDate(items) }];
  }

  const labels =
    view === "week"
      ? ["Pzt", "Sali", "Cars", "Pers", "Cuma", "Cmt", "Paz"]
      : Array.from({ length: 30 }, (_, index) => `${index + 1}`);

  return labels.map((label, index) => ({
    label,
    items: sortWorkPlanByDate(
      items.filter((item) => {
        const date = parseWorkPlanDate(item);
        if (view === "week") return weekdayIndex(date) === index;
        return date.getDate() === index + 1;
      }),
    ),
  }));
}

function workPlanViewLabel(view: "day" | "week" | "month"): string {
  if (view === "day") return "GUN";
  if (view === "week") return "HAFTA";
  return "AY";
}

function parseWorkPlanDate(item: Pick<WorkPlanItem, "date">): Date {
  const parsed = new Date(`${item.date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? startOfToday() : parsed;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function formatWeekday(value: string): string {
  const labels = ["Pzt", "Sali", "Cars", "Pers", "Cuma", "Cmt", "Paz"];
  return labels[weekdayIndex(parseWorkPlanDate({ date: value }))] ?? "Gun";
}

function getListConfig(
  data: MetrixWorkspaceData,
  moduleId:
    | "customers"
    | "products"
    | "offers"
    | "collections"
    | "team"
    | "suppliers"
    | "documents"
    | "goals",
): ListConfig {
  if (moduleId === "customers") {
    const rows = data.customers.map((item) => ({
      id: item.id,
      title: item.name,
      values: {
        name: item.name,
        industry: item.industry,
        status: item.status,
        collectionStatus: item.collectionStatus,
        lastContactDate: item.lastContactDate,
        riskLevel: item.riskLevel,
        notes: item.notes,
      },
    }));
    return {
      title: "Musteri portfoyu",
      kpis: [
        { label: "Toplam", value: String(rows.length) },
        { label: "Riskli tahsilat", value: String(rows.filter((row) => row.values.collectionStatus.includes("Gec")).length) },
        { label: "Sicak", value: String(rows.filter((row) => row.values.status.includes("Sicak")).length) },
        { label: "Sektor", value: String(new Set(rows.map((row) => row.values.industry)).size) },
      ],
      columns: [
        { key: "name", label: "Musteri" },
        { key: "industry", label: "Sektor" },
        { key: "status", label: "Durum" },
        { key: "collectionStatus", label: "Tahsilat" },
        { key: "lastContactDate", label: "Son temas" },
        { key: "riskLevel", label: "Risk" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "offers") {
    const rows = data.offers.map((item) => ({
      id: item.id,
      title: item.title,
      values: {
        customerName: item.customerName,
        title: item.title,
        amount: item.amount,
        status: item.status,
        expectedCloseDate: item.expectedCloseDate,
        notes: item.notes,
      },
    }));
    return {
      title: "Teklifler",
      kpis: [
        { label: "Teklif", value: String(rows.length) },
        { label: "Acik", value: String(rows.filter((row) => !row.values.status.includes("Kazan")).length) },
        { label: "Tutar", value: rows.reduce((sum, row) => sum + Number(row.values.amount || 0), 0).toLocaleString("tr-TR") },
        { label: "Bu ay", value: String(rows.filter((row) => row.values.expectedCloseDate.startsWith("2026-07")).length) },
      ],
      columns: [
        { key: "customerName", label: "Musteri" },
        { key: "title", label: "Teklif" },
        { key: "amount", label: "Tutar" },
        { key: "status", label: "Durum" },
        { key: "expectedCloseDate", label: "Kapanis" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "collections") {
    const rows = data.collections.map((item) => ({
      id: item.id,
      title: item.customerName,
      values: {
        customerName: item.customerName,
        amount: item.amount,
        dueDate: item.dueDate,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Tahsilatlar",
      kpis: [
        { label: "Kalem", value: String(rows.length) },
        { label: "Gecikmis", value: String(rows.filter((row) => row.values.status.includes("Gec")).length) },
        { label: "Toplam", value: rows.reduce((sum, row) => sum + Number(row.values.amount || 0), 0).toLocaleString("tr-TR") },
        { label: "Takip", value: "Aktif" },
      ],
      columns: [
        { key: "customerName", label: "Musteri" },
        { key: "amount", label: "Tutar" },
        { key: "dueDate", label: "Vade" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "goals") {
    const rows = data.goals.map((item) => ({
      id: item.id,
      title: item.title,
      values: {
        title: item.title,
        owner: item.owner,
        progress: item.progress,
        targetDate: item.targetDate,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Yonetim hedefleri",
      kpis: [
        { label: "Hedef", value: String(rows.length) },
        { label: "Acik", value: String(rows.filter((row) => row.values.status !== "Tamamlandi").length) },
        { label: "Ortalama", value: "%48" },
        { label: "Sahipli", value: String(rows.filter((row) => row.values.owner).length) },
      ],
      columns: [
        { key: "title", label: "Hedef" },
        { key: "owner", label: "Sorumlu" },
        { key: "progress", label: "Ilerleme" },
        { key: "targetDate", label: "Tarih" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "products") {
    const rows = data.products.map((item) => ({
      id: item.id,
      title: item.name,
      values: {
        name: item.name,
        category: item.category,
        price: item.price,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Urun / hizmet katalogu",
      kpis: [
        { label: "Kalem", value: String(rows.length) },
        { label: "Aktif", value: String(rows.filter((row) => row.values.status === "Aktif").length) },
        { label: "Kategori", value: String(new Set(rows.map((row) => row.values.category)).size) },
        { label: "Toplam", value: rows.reduce((sum, row) => sum + Number(row.values.price || 0), 0).toLocaleString("tr-TR") },
      ],
      columns: [
        { key: "name", label: "Urun / hizmet" },
        { key: "category", label: "Kategori" },
        { key: "price", label: "Fiyat" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "team") {
    const rows = data.team.map((item) => ({
      id: item.id,
      title: item.name,
      values: {
        name: item.name,
        role: item.role,
        phone: item.phone,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Personeller",
      kpis: [
        { label: "Kisi", value: String(rows.length) },
        { label: "Aktif", value: String(rows.filter((row) => row.values.status === "Aktif").length) },
        { label: "Rol", value: String(new Set(rows.map((row) => row.values.role)).size) },
        { label: "Takip", value: "Hazir" },
      ],
      columns: [
        { key: "name", label: "Personel" },
        { key: "role", label: "Rol" },
        { key: "phone", label: "Telefon" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "suppliers") {
    const rows = data.suppliers.map((item) => ({
      id: item.id,
      title: item.name,
      values: {
        name: item.name,
        category: item.category,
        contact: item.contact,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Tedarikciler",
      kpis: [
        { label: "Tedarikci", value: String(rows.length) },
        { label: "Aktif", value: String(rows.filter((row) => row.values.status === "Aktif").length) },
        { label: "Kategori", value: String(new Set(rows.map((row) => row.values.category)).size) },
        { label: "Risk", value: String(rows.filter((row) => row.values.status.includes("Risk")).length) },
      ],
      columns: [
        { key: "name", label: "Tedarikci" },
        { key: "category", label: "Kategori" },
        { key: "contact", label: "Iletisim" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  if (moduleId === "documents") {
    const rows = data.documents.map((item) => ({
      id: item.id,
      title: item.title,
      values: {
        title: item.title,
        category: item.category,
        relatedParty: item.relatedParty,
        date: item.date,
        status: item.status,
        notes: item.notes,
      },
    }));
    return {
      title: "Evrak merkezi",
      kpis: [
        { label: "Evrak", value: String(rows.length) },
        { label: "Kategori", value: String(new Set(rows.map((row) => row.values.category)).size) },
        { label: "Bekleyen", value: String(rows.filter((row) => row.values.status.includes("bek")).length) },
        { label: "Okuma", value: "Hazir" },
      ],
      columns: [
        { key: "title", label: "Evrak" },
        { key: "category", label: "Kategori" },
        { key: "relatedParty", label: "Ilgili" },
        { key: "date", label: "Tarih" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows,
    };
  }

  return getStaticListConfig(moduleId);
}

function getStaticListConfig(moduleId: "products" | "team" | "suppliers" | "documents"): ListConfig {
  const configs: Record<"products" | "team" | "suppliers" | "documents", ListConfig> = {
    products: {
      title: "Urun / hizmet katalogu",
      kpis: [
        { label: "Kalem", value: "3" },
        { label: "Aktif", value: "3" },
        { label: "Paket", value: "2" },
        { label: "Metrix okur", value: "Hazir" },
      ],
      columns: [
        { key: "name", label: "Urun / hizmet" },
        { key: "type", label: "Tip" },
        { key: "price", label: "Fiyat" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows: [
        { id: "prd_1", title: "AI Yonetim Paketi", values: { name: "AI Yonetim Paketi", type: "Hizmet", price: "185000", status: "Aktif", notes: "Tekliflerde ana paket" } },
        { id: "prd_2", title: "Haftalik Raporlama", values: { name: "Haftalik Raporlama", type: "Abonelik", price: "24000", status: "Aktif", notes: "Yonetim raporu sablonuyla bagli" } },
        { id: "prd_3", title: "Surec Analizi", values: { name: "Surec Analizi", type: "Proje", price: "65000", status: "Aktif", notes: "On analiz kalemi" } },
      ],
    },
    team: {
      title: "Personeller",
      kpis: [
        { label: "Kisi", value: "4" },
        { label: "Yuksek yuk", value: "1" },
        { label: "Sorumlu", value: "4" },
        { label: "Bosluk", value: "Takip" },
      ],
      columns: [
        { key: "name", label: "Personel" },
        { key: "role", label: "Rol" },
        { key: "load", label: "Yogunluk" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows: [
        { id: "team_1", title: "Murat", values: { name: "Murat", role: "Genel yonetim", load: "%82", status: "Kritik", notes: "Karar ve musteri takip yuksek" } },
        { id: "team_2", title: "Operasyon", values: { name: "Operasyon", role: "Teslimat", load: "%58", status: "Normal", notes: "Is planiyla takip edilecek" } },
      ],
    },
    suppliers: {
      title: "Tedarikciler",
      kpis: [
        { label: "Tedarikci", value: "3" },
        { label: "Risk", value: "1" },
        { label: "Odeme", value: "2" },
        { label: "Aktif", value: "3" },
      ],
      columns: [
        { key: "name", label: "Tedarikci" },
        { key: "category", label: "Kategori" },
        { key: "payment", label: "Odeme" },
        { key: "risk", label: "Risk" },
        { key: "notes", label: "Not" },
      ],
      rows: [
        { id: "sup_1", title: "Matbaa Partneri", values: { name: "Matbaa Partneri", category: "Baski", payment: "30 gun", risk: "Dusuk", notes: "Fiyat listesi evrak merkezine alinacak" } },
        { id: "sup_2", title: "Lojistik Firma", values: { name: "Lojistik Firma", category: "Tasima", payment: "Pesin", risk: "Orta", notes: "Alternatif tedarikci gerekli" } },
      ],
    },
    documents: {
      title: "Evrak merkezi",
      kpis: [
        { label: "Evrak", value: "5" },
        { label: "Bekleyen", value: "2" },
        { label: "Kategori", value: "5" },
        { label: "Okuma", value: "Hazir" },
      ],
      columns: [
        { key: "name", label: "Evrak" },
        { key: "category", label: "Kategori" },
        { key: "owner", label: "Ilgili" },
        { key: "status", label: "Durum" },
        { key: "notes", label: "Not" },
      ],
      rows: [
        { id: "doc_1", title: "Mayis hizmet faturasi", values: { name: "Mayis hizmet faturasi", category: "Fatura", owner: "Arel Mermer", status: "Tahsilat bekliyor", notes: "Collections ile baglanacak" } },
        { id: "doc_2", title: "Guncel fiyat listesi", values: { name: "Guncel fiyat listesi", category: "Fiyat listesi", owner: "Satis", status: "Aktif", notes: "Tekliflerde kullanilacak" } },
        { id: "doc_3", title: "Kartvizit taramasi", values: { name: "Kartvizit taramasi", category: "Kartvizit", owner: "Yeni lead", status: "Islenecek", notes: "Musteriye donusturulebilir" } },
      ],
    },
  };
  return configs[moduleId];
}

async function persistListRow(
  moduleId: Parameters<typeof getListConfig>[1],
  row: ListRow,
): Promise<void> {
  const isDraft = row.id.startsWith("draft_");
  const values = row.values;

  if (moduleId === "customers") {
    const input: Omit<MetrixCustomer, "id" | "createdAt" | "updatedAt"> = {
      name: values.name || row.title,
      industry: values.industry ?? "",
      status: values.status ?? "",
      collectionStatus: values.collectionStatus ?? "",
      lastContactDate: values.lastContactDate ?? "",
      riskLevel: values.riskLevel ?? "Normal",
      notes: values.notes ?? "",
    };
    if (isDraft) await createCustomer(input);
    else await updateCustomer(row.id, input);
  }

  if (moduleId === "products") {
    const input: Omit<Product, "id" | "createdAt" | "updatedAt"> = {
      name: values.name || row.title,
      category: values.category ?? "",
      price: values.price ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createProduct(input);
    else await updateProduct(row.id, input);
  }

  if (moduleId === "offers") {
    const input: Omit<Offer, "id" | "createdAt" | "updatedAt"> = {
      customerName: values.customerName ?? "",
      title: values.title || row.title,
      amount: values.amount ?? "",
      status: values.status ?? "",
      expectedCloseDate: values.expectedCloseDate ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createOffer(input);
    else await updateOffer(row.id, input);
  }

  if (moduleId === "collections") {
    const input: Omit<Collection, "id" | "createdAt" | "updatedAt"> = {
      customerName: values.customerName ?? "",
      amount: values.amount ?? "",
      dueDate: values.dueDate ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createCollection(input);
    else await updateCollection(row.id, input);
  }

  if (moduleId === "team") {
    const input: Omit<TeamMember, "id" | "createdAt" | "updatedAt"> = {
      name: values.name || row.title,
      role: values.role ?? "",
      phone: values.phone ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createTeamMember(input);
    else await updateTeamMember(row.id, input);
  }

  if (moduleId === "suppliers") {
    const input: Omit<Supplier, "id" | "createdAt" | "updatedAt"> = {
      name: values.name || row.title,
      category: values.category ?? "",
      contact: values.contact ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createSupplier(input);
    else await updateSupplier(row.id, input);
  }

  if (moduleId === "documents") {
    const input: Omit<BusinessDocument, "id" | "createdAt" | "updatedAt"> = {
      title: values.title || row.title,
      category: values.category ?? "",
      relatedParty: values.relatedParty ?? "",
      date: values.date ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createDocument(input);
    else await updateDocument(row.id, input);
  }

  if (moduleId === "goals") {
    const input: Omit<Goal, "id" | "createdAt" | "updatedAt"> = {
      title: values.title || row.title,
      owner: values.owner ?? "",
      targetDate: values.targetDate ?? "",
      progress: values.progress ?? "",
      status: values.status ?? "",
      notes: values.notes ?? "",
    };
    if (isDraft) await createGoal(input);
    else await updateGoal(row.id, input);
  }
}

async function deleteListRow(
  moduleId: Parameters<typeof getListConfig>[1],
  id: string,
): Promise<void> {
  if (moduleId === "products") await deleteProduct(id);
  if (moduleId === "customers") await deleteCustomer(id);
  if (moduleId === "offers") await deleteOffer(id);
  if (moduleId === "collections") await deleteCollection(id);
  if (moduleId === "team") await deleteTeamMember(id);
  if (moduleId === "suppliers") await deleteSupplier(id);
  if (moduleId === "documents") await deleteDocument(id);
  if (moduleId === "goals") await deleteGoal(id);
}

function EditorView({
  data,
  moduleId,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  moduleId: LegacyEditorModule;
  onRefresh: () => Promise<void>;
}) {
  const fields = fieldMap[moduleId];
  const [form, setForm] = useState<Record<string, string>>(emptyForm[moduleId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<ReportTemplate[]>([]);

  useEffect(() => {
    setForm(emptyForm[moduleId]);
    setEditingId(null);
    setSuggested([]);
  }, [moduleId]);

  const items = useMemo(() => getItems(data, moduleId), [data, moduleId]);

  async function submit() {
    if (!Object.values(form).some((value) => value.trim())) return;

    if (moduleId === "customers") {
      if (editingId) {
        await updateCustomer(editingId, form as Omit<MetrixCustomer, "id" | "updatedAt">);
      } else {
        await createCustomer(form as Omit<MetrixCustomer, "id" | "updatedAt">);
      }
    }
    if (moduleId === "sales") {
      if (editingId) {
        await updateSalesOpportunity(editingId, form as Omit<SalesOpportunity, "id" | "updatedAt">);
      } else {
        await createSalesOpportunity(form as Omit<SalesOpportunity, "id" | "updatedAt">);
      }
    }
    if (moduleId === "finance") {
      if (editingId) {
        await updateFinanceItem(editingId, form as Omit<FinanceItem, "id" | "updatedAt">);
      } else {
        await createFinanceItem(form as Omit<FinanceItem, "id" | "updatedAt">);
      }
    }
    if (moduleId === "tasks") {
      if (editingId) {
        await updateTask(editingId, form as Omit<ExecutiveTask, "id" | "updatedAt">);
      } else {
        await createTask(form as Omit<ExecutiveTask, "id" | "updatedAt">);
      }
    }
    if (moduleId === "templates") {
      if (editingId) {
        await updateReportTemplate(editingId, form as Omit<ReportTemplate, "id" | "updatedAt">);
      } else {
        await createReportTemplate(form as Omit<ReportTemplate, "id" | "updatedAt">);
      }
    }

    setForm(emptyForm[moduleId]);
    setEditingId(null);
    await onRefresh();
  }

  async function remove(id: string) {
    if (moduleId === "customers") await deleteCustomer(id);
    if (moduleId === "sales") await deleteSalesOpportunity(id);
    if (moduleId === "finance") await deleteFinanceItem(id);
    if (moduleId === "tasks") await deleteTask(id);
    if (moduleId === "templates") await deleteReportTemplate(id);
    await onRefresh();
  }

  async function suggest() {
    const industry = form.industry ?? "";
    setSuggested(await suggestTemplatesByIndustry(industry));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <section className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-4">
        <h3 className="text-lg font-semibold">{editingId ? "Kaydi guncelle" : "Yeni kayit"}</h3>
        <div className="mt-4 space-y-3">
          {fields.map((field) => (
            <label className="block" key={field.key}>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#9f8a70]">
                {field.label}
              </span>
              {field.type === "textarea" ? (
                <textarea
                  className="mt-1 min-h-24 w-full resize-none rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 py-2 text-sm text-[#f7efe2] outline-none focus:border-[#c69b61]"
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  value={form[field.key] ?? ""}
                />
              ) : (
                <input
                  className="mt-1 h-11 w-full rounded-md border border-[#3a2a1c] bg-[#120f0b] px-3 text-sm text-[#f7efe2] outline-none focus:border-[#c69b61]"
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  type={field.type ?? "text"}
                  value={form[field.key] ?? ""}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d]"
            onClick={() => void submit()}
            type="button"
          >
            {editingId ? "Guncelle" : "Kaydet"}
          </button>
          {editingId ? (
            <button
              className="rounded-md border border-[#4b3828] px-4 py-2 text-sm font-bold text-[#d6c6b2]"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm[moduleId]);
              }}
              type="button"
            >
              Vazgec
            </button>
          ) : null}
          {moduleId === "templates" ? (
            <button
              className="rounded-md border border-[#c69b61]/45 px-4 py-2 text-sm font-bold text-[#f0dec2]"
              onClick={() => void suggest()}
              type="button"
            >
              Sektore gore oner
            </button>
          ) : null}
        </div>
        {suggested.length ? (
          <div className="mt-4 space-y-2 border-t border-[#33261a] pt-4">
            {suggested.map((template) => (
              <p className="text-sm leading-6 text-[#cdbda8]" key={template.id}>
                <span className="font-bold text-[#f0dec2]">{template.title}</span>: {template.sections}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        {items.map((item) => (
          <ItemBlock
            fields={fields}
            item={item}
            key={item.id}
            onDelete={() => void remove(item.id)}
            onEdit={() => {
              setEditingId(item.id);
              setForm(pickForm(item, fields));
            }}
          />
        ))}
        {!items.length ? (
          <p className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5 text-sm text-[#b9aa97]">
            Henuz kayit yok.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ReportsView({
  data,
  onRefresh,
}: {
  data: MetrixWorkspaceData;
  onRefresh: () => Promise<void>;
}) {
  async function createReport() {
    await generateReport("Metrix Genel Mudur Raporu");
    await onRefresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
        <h3 className="text-xl font-semibold">Rapor uretimi</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#cdbda8]">
          Demo rapor, musteriler, satis, finans ve aksiyon kayitlarini okuyup tek ozet uretir.
        </p>
        <button
          className="mt-4 rounded-md bg-[#f0dec2] px-4 py-2 text-sm font-black text-[#17120d]"
          onClick={() => void createReport()}
          type="button"
        >
          Demo rapor uret
        </button>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {data.reports.map((report) => (
          <ReportBlock report={report} key={report.id} />
        ))}
      </section>
    </div>
  );
}

function ItemBlock({
  item,
  fields,
  onEdit,
  onDelete,
}: {
  item: EditableItem;
  fields: Field[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h4 className="text-lg font-semibold text-[#f7efe2]">
            {readTitle(item)}
          </h4>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9f8a70]">
                  {field.label}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-[#d6c6b2]">
                  {String(item[field.key as keyof EditableItem] ?? "-")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="rounded-md border border-[#c69b61]/45 px-3 py-2 text-xs font-black text-[#f0dec2]"
            onClick={onEdit}
            type="button"
          >
            Duzenle
          </button>
          <button
            className="rounded-md border border-[#7f312d] px-3 py-2 text-xs font-black text-[#ffb7ac]"
            onClick={onDelete}
            type="button"
          >
            Sil
          </button>
        </div>
      </div>
    </article>
  );
}

function ReportBlock({ report }: { report: GeneratedReport }) {
  return (
    <article className="rounded-lg border border-[#3a2a1c] bg-[#1b140e] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c69b61]">
        {new Date(report.createdAt).toLocaleDateString("tr-TR")}
      </p>
      <h4 className="mt-2 text-lg font-semibold text-[#f7efe2]">{report.title}</h4>
      <p className="mt-3 text-sm leading-6 text-[#cdbda8]">{report.summary}</p>
      <p className="mt-4 text-xs font-bold text-[#9f8a70]">{report.source}</p>
    </article>
  );
}

function getItems(
  data: MetrixWorkspaceData,
  moduleId: LegacyEditorModule,
): EditableItem[] {
  if (moduleId === "customers") return data.customers;
  if (moduleId === "sales") return data.sales;
  if (moduleId === "finance") return data.finance;
  if (moduleId === "tasks") return data.tasks;
  return data.templates;
}

function pickForm(item: EditableItem, fields: Field[]): Record<string, string> {
  return fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = String(item[field.key as keyof EditableItem] ?? "");
    return acc;
  }, {});
}

function readTitle(item: EditableItem): string {
  if ("title" in item) return item.title;
  if ("name" in item) return item.name;
  if ("customer" in item) return item.customer;
  return (item as { id: string }).id;
}
