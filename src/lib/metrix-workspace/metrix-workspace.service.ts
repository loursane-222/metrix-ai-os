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
  Product,
  ReportTemplate,
  SalesOpportunity,
  Supplier,
  TeamMember,
  WorkPlanItem,
} from "./metrix-workspace.types";

const STORAGE_KEY = "metrix_workspace_v1";

const now = () => new Date().toISOString();

const initialData: MetrixWorkspaceData = {
  companyProfile: {
    companyName: "Metrix Demo Sirketi",
    industry: "Danismanlik ve teknoloji",
    workingStyle: "Kurucu odakli, haftalik karar ritmi",
    mainGoal: "Teklif kapanis hizini artirmak, tahsilat gecikmesini azaltmak",
    notes: "Istanbul merkezli, B2B hizmet ve proje modeli",
    updatedAt: now(),
  },
  accountingProfile: {
    accountantName: "Muhasebe Ofisi",
    contact: "muhasebe@example.com",
    integrationStatus: "Beklemede",
    notes: "KDV ve tahsilat raporu aylik kapanista gonderilecek.",
    updatedAt: now(),
  },
  customers: [
    {
      id: "cus_arch_1",
      name: "Nova Mimarlik",
      industry: "mimarlik",
      status: "Aktif",
      collectionStatus: "Takipte",
      lastContactDate: "2026-06-24",
      riskLevel: "Orta",
      notes: "Teklif revizyonu ve uygulama takvimi bekleniyor.",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "cus_marble_1",
      name: "Arel Mermer",
      industry: "mermer",
      status: "Sicak",
      collectionStatus: "Gecikmis",
      lastContactDate: "2026-05-20",
      riskLevel: "Yuksek",
      notes: "Tahsilat vadesi asildi; Cuma gunu arama planlandi.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  products: [
    {
      id: "prd_1",
      name: "AI Yonetim Paketi",
      category: "Hizmet",
      price: "185000",
      status: "Aktif",
      notes: "Tekliflerde ana paket.",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "prd_2",
      name: "Haftalik Raporlama",
      category: "Abonelik",
      price: "24000",
      status: "Aktif",
      notes: "Yonetim raporu sablonuyla bagli.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  offers: [
    {
      id: "off_1",
      offerNo: "TKL-2026-001",
      customerName: "Nova Mimarlik",
      title: "Kurumsal Donusum ve Dijital Yonetim Paketi",
      amount: "222000",
      status: "Teklif Verildi",
      expectedCloseDate: "2026-07-12",
      notes: "Karar verici toplantisi bekleniyor.",
      validityDate: "2026-07-31",
      totalArea: "1.200 m2",
      estimatedDuration: "3 ay",
      description: "Nova Mimarlik ofislerinin kurumsal surec optimizasyonu ve AI tabanli yonetim altyapisi kurulumunu kapsar. Mevcut is akislari haritalanacak, karar ritmi duzenlenecek ve haftalik raporlama mekanizmasi devreye alinacak.",
      lineItems: [
        {
          id: "li_1",
          name: "AI Yonetim Paketi",
          description: "Temel yonetim altyapisi kurulumu ve ilk 3 ay destegi",
          quantity: "1",
          unit: "paket",
          unitPrice: "150000",
        },
        {
          id: "li_2",
          name: "Surec Analizi ve Haritalama",
          description: "Mevcut is akislarinin analizi",
          quantity: "1",
          unit: "proje",
          unitPrice: "35000",
        },
      ],
      paymentTerms: "%30 pesin sozlesme imzasinda, kalan %70 teslimat sonrasi 30 gun vade ile.",
      deliveryTerms: "Sozlesme tarihinden itibaren 3 ay icinde tamamlanir. Haftalik ilerleme raporu sunulur.",
      conditions: "Bu teklif gecerlilik tarihine kadar gecerlidir. Belirtilen fiyatlar KDV haric olup KDV %20 oraninda ayrica uygulanir. Kapsam degisikligi halinde ek fiyatlandirma yapilir.",
      viewCount: 3,
      lastViewedAt: now(),
      heatScore: 62,
      activityLog: [
        { at: now(), type: "created", note: "Teklif olusturuldu." },
        { at: now(), type: "view", note: "Teklif goruntulendi (1. kez)." },
        { at: now(), type: "view", note: "Teklif goruntulendi (2. kez)." },
        { at: now(), type: "view", note: "Teklif goruntulendi (3. kez)." },
      ],
      approvedAt: "",
      customerQuestion: "",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "off_2",
      offerNo: "TKL-2026-002",
      customerName: "Arel Mermer",
      title: "Uretim Takip ve Maliyet Analizi",
      amount: "96000",
      status: "Gorusme",
      expectedCloseDate: "2026-07-28",
      notes: "Ilk gorusme gerceklesti, revizyon bekleniyor.",
      validityDate: "2026-08-15",
      totalArea: "",
      estimatedDuration: "6 hafta",
      description: "Mermer uretim sureclerinin maliyetlenmesi, fire takibi ve haftalik yonetim raporu altyapisi.",
      lineItems: [
        {
          id: "li_3",
          name: "Maliyet Analizi Modulu",
          description: "Uretim maliyet haritalamasi",
          quantity: "1",
          unit: "proje",
          unitPrice: "45000",
        },
        {
          id: "li_4",
          name: "Haftalik Raporlama",
          description: "6 haftalik periyot",
          quantity: "6",
          unit: "hafta",
          unitPrice: "5000",
        },
      ],
      paymentTerms: "%50 pesin, %50 teslimatta.",
      deliveryTerms: "6 hafta.",
      conditions: "KDV haric fiyatlardir.",
      viewCount: 1,
      lastViewedAt: now(),
      heatScore: 28,
      activityLog: [
        { at: now(), type: "created", note: "Teklif olusturuldu." },
        { at: now(), type: "view", note: "Teklif goruntulendi (1. kez)." },
      ],
      approvedAt: "",
      customerQuestion: "",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  collections: [
    {
      id: "col_1",
      customerName: "Arel Mermer",
      amount: "42000",
      dueDate: "2026-07-04",
      status: "Gecikmis",
      notes: "Mayis hizmet faturasi.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  team: [
    {
      id: "team_1",
      name: "Murat",
      role: "Genel yonetim",
      phone: "+90 555 000 00 00",
      status: "Kritik",
      notes: "Karar ve musteri takip yuku yuksek.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  suppliers: [
    {
      id: "sup_1",
      name: "Matbaa Partneri",
      category: "Baski",
      contact: "partner@example.com",
      status: "Aktif",
      notes: "Fiyat listesi evrak merkezine alinacak.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  documents: [
    {
      id: "doc_1",
      title: "Mayis hizmet faturasi",
      category: "Fatura",
      relatedParty: "Arel Mermer",
      date: "2026-06-15",
      status: "Tahsilat bekliyor",
      notes: "Collections ile baglanacak.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  goals: [
    {
      id: "goal_1",
      title: "Tahsilat gecikmesini azalt",
      owner: "Murat",
      targetDate: "2026-07-31",
      progress: "45",
      status: "Acik",
      notes: "Gecikmis tahsilatlar haftalik ritme alinacak.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  workPlan: [
    {
      id: "wp_1",
      title: "Arel Mermer tahsilat aramasi",
      date: "2026-07-01",
      startTime: "10:00",
      endTime: "10:30",
      workloadPercent: "30",
      status: "Planlandi",
      notes: "Geciken tahsilat icin karar gorusmesi.",
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  sales: [
    {
      id: "sale_1",
      customer: "Nova Mimarlik",
      name: "Kurumsal donusum paketi",
      amount: "185000",
      stage: "Teklif",
      expectedCloseDate: "2026-07-12",
      notes: "Karar verici toplantisi bekleniyor.",
      updatedAt: now(),
    },
  ],
  finance: [
    {
      id: "fin_1",
      customer: "Arel Mermer",
      amount: "42000",
      dueDate: "2026-07-04",
      paymentStatus: "Gecikmis",
      description: "Mayis hizmet faturasi.",
      updatedAt: now(),
    },
  ],
  tasks: [
    {
      id: "task_1",
      title: "Geciken tahsilat icin aksiyon al",
      owner: "Murat",
      priority: "Yuksek",
      date: "2026-07-01",
      status: "Acik",
      notes: "Finans gorunumunden Arel Mermer kalemiyle iliskili.",
      updatedAt: now(),
    },
  ],
  templates: [
    {
      id: "tpl_mimarlik",
      industry: "mimarlik",
      title: "Mimarlik Ofisi Haftalik Yonetim Raporu",
      sections: "Proje ilerleme, teklif bekleyenler, nakit akisi, musteri riskleri",
      updatedAt: now(),
    },
    {
      id: "tpl_mermer",
      industry: "mermer",
      title: "Mermer Satis ve Tahsilat Raporu",
      sections: "Ocak/uretim durumu, ihracat teklifleri, tahsilat, stok riski",
      updatedAt: now(),
    },
    {
      id: "tpl_danismanlik",
      industry: "danismanlik",
      title: "Danismanlik Portfoy Raporu",
      sections: "Aktif projeler, musteri sagligi, kapasite, yenileme riski",
      updatedAt: now(),
    },
    {
      id: "tpl_ajans",
      industry: "ajans",
      title: "Ajans Operasyon Raporu",
      sections: "Kampanyalar, revizyon yuku, musteri memnuniyeti, faturalama",
      updatedAt: now(),
    },
    {
      id: "tpl_uretim",
      industry: "uretim",
      title: "Uretim Yonetim Ozeti",
      sections: "Siparis, kapasite, termin riski, fire, nakit etkisi",
      updatedAt: now(),
    },
  ],
  reports: [
    {
      id: "rep_1",
      title: "Bugunun Genel Mudur Ozeti",
      summary:
        "Tahsilat riski Arel Mermer uzerinde yogunlasiyor. Nova Mimarlik teklifinin kapanmasi icin karar verici toplantisi kritik.",
      source: "Demo calisma alani",
      createdAt: now(),
    },
  ],
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cloneData(data: MetrixWorkspaceData): MetrixWorkspaceData {
  return JSON.parse(JSON.stringify(data)) as MetrixWorkspaceData;
}

function normalizeWorkspaceData(data: MetrixWorkspaceData): MetrixWorkspaceData {
  return {
    ...data,
    customers: sortNewestFirst(
      data.customers.map((customer) => ({
        ...customer,
        lastContactDate: customer.lastContactDate ?? "",
        riskLevel: customer.riskLevel ?? "Normal",
        createdAt: customer.createdAt ?? customer.updatedAt ?? now(),
        updatedAt: customer.updatedAt ?? now(),
      })),
    ),
    offers: sortNewestFirst(
      (data.offers ?? []).map((offer) => ({
        offerNo: "",
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
        activityLog: [],
        approvedAt: "",
        customerQuestion: "",
        ...offer,
        notes: offer.notes ?? "",
        createdAt: offer.createdAt ?? offer.updatedAt ?? now(),
        updatedAt: offer.updatedAt ?? now(),
      })),
    ),
  };
}

function computeOfferHeatScore(offer: Partial<Offer>): number {
  let score = 0;
  const viewCount = offer.viewCount ?? 0;
  score += Math.min(viewCount * 10, 40);
  if (offer.lastViewedAt) {
    const hoursSince = (Date.now() - new Date(offer.lastViewedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) score += 30;
    else if (hoursSince < 72) score += 15;
    else if (hoursSince < 168) score += 5;
  }
  if (offer.customerQuestion) score += 20;
  if (offer.approvedAt) score = Math.max(score, 90);
  return Math.min(Math.round(score), 100);
}

export async function readWorkspaceData(): Promise<MetrixWorkspaceData> {
  if (typeof window === "undefined") return normalizeWorkspaceData(cloneData(initialData));

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = cloneData(initialData);
    writeWorkspaceData(seeded);
    return seeded;
  }

  try {
    return normalizeWorkspaceData({ ...cloneData(initialData), ...JSON.parse(raw) } as MetrixWorkspaceData);
  } catch {
    const seeded = cloneData(initialData);
    writeWorkspaceData(seeded);
    return seeded;
  }
}

export function writeWorkspaceData(data: MetrixWorkspaceData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function updateWorkspace(
  updater: (data: MetrixWorkspaceData) => MetrixWorkspaceData,
): Promise<MetrixWorkspaceData> {
  const current = await readWorkspaceData();
  const next = updater(current);
  writeWorkspaceData(next);
  return next;
}

type CollectionKey =
  | "products"
  | "offers"
  | "collections"
  | "team"
  | "suppliers"
  | "documents"
  | "goals"
  | "workPlan";

type CollectionItem = MetrixWorkspaceData[CollectionKey][number];

function sortNewestFirst<T extends { createdAt?: string; updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const right = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return right - left;
  });
}

async function readCollection<K extends CollectionKey>(key: K): Promise<MetrixWorkspaceData[K]> {
  const data = await readWorkspaceData();
  return sortNewestFirst(data[key] as Array<CollectionItem>) as MetrixWorkspaceData[K];
}

async function createCollectionItem<K extends CollectionKey>(
  key: K,
  prefix: string,
  input: Omit<MetrixWorkspaceData[K][number], "id" | "createdAt" | "updatedAt">,
): Promise<MetrixWorkspaceData[K][number]> {
  const timestamp = now();
  const item = {
    ...input,
    id: makeId(prefix),
    createdAt: timestamp,
    updatedAt: timestamp,
  } as MetrixWorkspaceData[K][number];

  await updateWorkspace((data) => ({
    ...data,
    [key]: sortNewestFirst([item as CollectionItem, ...(data[key] as CollectionItem[])]),
  }));

  return item;
}

async function updateCollectionItem<K extends CollectionKey>(
  key: K,
  id: string,
  input: Omit<MetrixWorkspaceData[K][number], "id" | "createdAt" | "updatedAt">,
): Promise<MetrixWorkspaceData[K][number] | null> {
  let updated: MetrixWorkspaceData[K][number] | null = null;

  await updateWorkspace((data) => ({
    ...data,
    [key]: sortNewestFirst(
      (data[key] as CollectionItem[]).map((item) => {
        if (item.id !== id) return item;
        updated = { ...item, ...input, updatedAt: now() } as MetrixWorkspaceData[K][number];
        return updated as CollectionItem;
      }),
    ),
  }));

  return updated;
}

async function deleteCollectionItem(key: CollectionKey, id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    [key]: (data[key] as CollectionItem[]).filter((item) => item.id !== id),
  }));
}

export async function readCustomers(): Promise<MetrixCustomer[]> {
  return sortNewestFirst((await readWorkspaceData()).customers);
}

export async function createCustomer(
  input: Omit<MetrixCustomer, "id" | "createdAt" | "updatedAt">,
): Promise<MetrixCustomer> {
  const timestamp = now();
  const customer = { ...input, id: makeId("cus"), createdAt: timestamp, updatedAt: timestamp };
  await updateWorkspace((data) => ({ ...data, customers: [customer, ...data.customers] }));
  return customer;
}

export async function updateCustomer(
  id: string,
  input: Omit<MetrixCustomer, "id" | "createdAt" | "updatedAt">,
): Promise<MetrixCustomer | null> {
  let updated: MetrixCustomer | null = null;
  await updateWorkspace((data) => ({
    ...data,
    customers: data.customers.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...input, updatedAt: now() };
      return updated;
    }),
  }));
  return updated;
}

export async function deleteCustomer(id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    customers: data.customers.filter((item) => item.id !== id),
  }));
}

export async function readProducts(): Promise<Product[]> {
  return readCollection("products");
}

export async function createProduct(
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product> {
  return createCollectionItem("products", "prd", input);
}

export async function updateProduct(
  id: string,
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product | null> {
  return updateCollectionItem("products", id, input);
}

export async function deleteProduct(id: string): Promise<void> {
  return deleteCollectionItem("products", id);
}

export async function readOffers(): Promise<Offer[]> {
  return readCollection("offers");
}

export async function createOffer(
  input: Omit<Offer, "id" | "createdAt" | "updatedAt">,
): Promise<Offer> {
  return createCollectionItem("offers", "off", input);
}

export async function updateOffer(
  id: string,
  input: Omit<Offer, "id" | "createdAt" | "updatedAt">,
): Promise<Offer | null> {
  return updateCollectionItem("offers", id, input);
}

export async function deleteOffer(id: string): Promise<void> {
  return deleteCollectionItem("offers", id);
}

export async function trackOfferView(id: string): Promise<void> {
  const data = await readWorkspaceData();
  const offer = data.offers.find((o) => o.id === id);
  if (!offer) return;
  const nowStr = now();
  const viewCount = (offer.viewCount ?? 0) + 1;
  const newEntry: ActivityLogEntry = {
    at: nowStr,
    type: "view",
    note: `Teklif goruntulendi (${viewCount}. kez).`,
  };
  const activityLog = [...(offer.activityLog ?? []), newEntry];
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = offer;
  void _id; void _c; void _u;
  await updateOffer(id, {
    ...rest,
    viewCount,
    lastViewedAt: nowStr,
    activityLog,
    heatScore: computeOfferHeatScore({ ...offer, viewCount, lastViewedAt: nowStr, activityLog }),
  });
}

export async function approveOffer(id: string): Promise<void> {
  const data = await readWorkspaceData();
  const offer = data.offers.find((o) => o.id === id);
  if (!offer) return;
  const nowStr = now();
  const newEntry: ActivityLogEntry = {
    at: nowStr,
    type: "approved",
    note: "Musteri teklifi onayladi.",
  };
  const activityLog = [...(offer.activityLog ?? []), newEntry];
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = offer;
  void _id; void _c; void _u;
  await updateOffer(id, {
    ...rest,
    status: "Onaylandi",
    approvedAt: nowStr,
    heatScore: 100,
    activityLog,
  });
}

export async function submitOfferQuestion(id: string, question: string): Promise<void> {
  const data = await readWorkspaceData();
  const offer = data.offers.find((o) => o.id === id);
  if (!offer) return;
  const nowStr = now();
  const newEntry: ActivityLogEntry = {
    at: nowStr,
    type: "question",
    note: `Musteri sorusu: ${question}`,
  };
  const activityLog = [...(offer.activityLog ?? []), newEntry];
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = offer;
  void _id; void _c; void _u;
  await updateOffer(id, {
    ...rest,
    customerQuestion: question,
    activityLog,
    heatScore: computeOfferHeatScore({ ...offer, customerQuestion: question, activityLog }),
  });
}

export async function readCollections(): Promise<Collection[]> {
  return readCollection("collections");
}

export async function createCollection(
  input: Omit<Collection, "id" | "createdAt" | "updatedAt">,
): Promise<Collection> {
  return createCollectionItem("collections", "col", input);
}

export async function updateCollection(
  id: string,
  input: Omit<Collection, "id" | "createdAt" | "updatedAt">,
): Promise<Collection | null> {
  return updateCollectionItem("collections", id, input);
}

export async function deleteCollection(id: string): Promise<void> {
  return deleteCollectionItem("collections", id);
}

export async function readTeam(): Promise<TeamMember[]> {
  return readCollection("team");
}

export async function createTeamMember(
  input: Omit<TeamMember, "id" | "createdAt" | "updatedAt">,
): Promise<TeamMember> {
  return createCollectionItem("team", "team", input);
}

export async function updateTeamMember(
  id: string,
  input: Omit<TeamMember, "id" | "createdAt" | "updatedAt">,
): Promise<TeamMember | null> {
  return updateCollectionItem("team", id, input);
}

export async function deleteTeamMember(id: string): Promise<void> {
  return deleteCollectionItem("team", id);
}

export async function readSuppliers(): Promise<Supplier[]> {
  return readCollection("suppliers");
}

export async function createSupplier(
  input: Omit<Supplier, "id" | "createdAt" | "updatedAt">,
): Promise<Supplier> {
  return createCollectionItem("suppliers", "sup", input);
}

export async function updateSupplier(
  id: string,
  input: Omit<Supplier, "id" | "createdAt" | "updatedAt">,
): Promise<Supplier | null> {
  return updateCollectionItem("suppliers", id, input);
}

export async function deleteSupplier(id: string): Promise<void> {
  return deleteCollectionItem("suppliers", id);
}

export async function readDocuments(): Promise<BusinessDocument[]> {
  return readCollection("documents");
}

export async function createDocument(
  input: Omit<BusinessDocument, "id" | "createdAt" | "updatedAt">,
): Promise<BusinessDocument> {
  return createCollectionItem("documents", "doc", input);
}

export async function updateDocument(
  id: string,
  input: Omit<BusinessDocument, "id" | "createdAt" | "updatedAt">,
): Promise<BusinessDocument | null> {
  return updateCollectionItem("documents", id, input);
}

export async function deleteDocument(id: string): Promise<void> {
  return deleteCollectionItem("documents", id);
}

export async function readGoals(): Promise<Goal[]> {
  return readCollection("goals");
}

export async function createGoal(
  input: Omit<Goal, "id" | "createdAt" | "updatedAt">,
): Promise<Goal> {
  return createCollectionItem("goals", "goal", input);
}

export async function updateGoal(
  id: string,
  input: Omit<Goal, "id" | "createdAt" | "updatedAt">,
): Promise<Goal | null> {
  return updateCollectionItem("goals", id, input);
}

export async function deleteGoal(id: string): Promise<void> {
  return deleteCollectionItem("goals", id);
}

export async function readWorkPlan(): Promise<WorkPlanItem[]> {
  return readCollection("workPlan");
}

export async function createWorkPlanItem(
  input: Omit<WorkPlanItem, "id" | "createdAt" | "updatedAt">,
): Promise<WorkPlanItem> {
  return createCollectionItem("workPlan", "wp", input);
}

export async function updateWorkPlanItem(
  id: string,
  input: Omit<WorkPlanItem, "id" | "createdAt" | "updatedAt">,
): Promise<WorkPlanItem | null> {
  return updateCollectionItem("workPlan", id, input);
}

export async function deleteWorkPlanItem(id: string): Promise<void> {
  return deleteCollectionItem("workPlan", id);
}

export async function readCompanyProfile(): Promise<CompanyProfile> {
  return (await readWorkspaceData()).companyProfile;
}

export async function updateCompanyProfile(
  input: Omit<CompanyProfile, "updatedAt">,
): Promise<CompanyProfile> {
  const profile = { ...input, updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, companyProfile: profile }));
  return profile;
}

export async function readAccountingProfile(): Promise<AccountingProfile> {
  return (await readWorkspaceData()).accountingProfile;
}

export async function updateAccountingProfile(
  input: Omit<AccountingProfile, "updatedAt">,
): Promise<AccountingProfile> {
  const profile = { ...input, updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, accountingProfile: profile }));
  return profile;
}

export async function readSales(): Promise<SalesOpportunity[]> {
  return (await readWorkspaceData()).sales;
}

export async function createSalesOpportunity(
  input: Omit<SalesOpportunity, "id" | "updatedAt">,
): Promise<SalesOpportunity> {
  const opportunity = { ...input, id: makeId("sale"), updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, sales: [opportunity, ...data.sales] }));
  return opportunity;
}

export async function updateSalesOpportunity(
  id: string,
  input: Omit<SalesOpportunity, "id" | "updatedAt">,
): Promise<SalesOpportunity | null> {
  let updated: SalesOpportunity | null = null;
  await updateWorkspace((data) => ({
    ...data,
    sales: data.sales.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...input, updatedAt: now() };
      return updated;
    }),
  }));
  return updated;
}

export async function deleteSalesOpportunity(id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    sales: data.sales.filter((item) => item.id !== id),
  }));
}

export async function readFinance(): Promise<FinanceItem[]> {
  return (await readWorkspaceData()).finance;
}

export async function createFinanceItem(
  input: Omit<FinanceItem, "id" | "updatedAt">,
): Promise<FinanceItem> {
  const financeItem = { ...input, id: makeId("fin"), updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, finance: [financeItem, ...data.finance] }));
  return financeItem;
}

export async function updateFinanceItem(
  id: string,
  input: Omit<FinanceItem, "id" | "updatedAt">,
): Promise<FinanceItem | null> {
  let updated: FinanceItem | null = null;
  await updateWorkspace((data) => ({
    ...data,
    finance: data.finance.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...input, updatedAt: now() };
      return updated;
    }),
  }));
  return updated;
}

export async function deleteFinanceItem(id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    finance: data.finance.filter((item) => item.id !== id),
  }));
}

export async function readTasks(): Promise<ExecutiveTask[]> {
  return (await readWorkspaceData()).tasks;
}

export async function createTask(
  input: Omit<ExecutiveTask, "id" | "updatedAt">,
): Promise<ExecutiveTask> {
  const task = { ...input, id: makeId("task"), updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, tasks: [task, ...data.tasks] }));
  return task;
}

export async function updateTask(
  id: string,
  input: Omit<ExecutiveTask, "id" | "updatedAt">,
): Promise<ExecutiveTask | null> {
  let updated: ExecutiveTask | null = null;
  await updateWorkspace((data) => ({
    ...data,
    tasks: data.tasks.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...input, updatedAt: now() };
      return updated;
    }),
  }));
  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    tasks: data.tasks.filter((item) => item.id !== id),
  }));
}

export async function readTemplates(): Promise<ReportTemplate[]> {
  return (await readWorkspaceData()).templates;
}

export async function createReportTemplate(
  input: Omit<ReportTemplate, "id" | "updatedAt">,
): Promise<ReportTemplate> {
  const template = { ...input, id: makeId("tpl"), updatedAt: now() };
  await updateWorkspace((data) => ({ ...data, templates: [template, ...data.templates] }));
  return template;
}

export async function updateReportTemplate(
  id: string,
  input: Omit<ReportTemplate, "id" | "updatedAt">,
): Promise<ReportTemplate | null> {
  let updated: ReportTemplate | null = null;
  await updateWorkspace((data) => ({
    ...data,
    templates: data.templates.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...input, updatedAt: now() };
      return updated;
    }),
  }));
  return updated;
}

export async function deleteReportTemplate(id: string): Promise<void> {
  await updateWorkspace((data) => ({
    ...data,
    templates: data.templates.filter((item) => item.id !== id),
  }));
}

export async function readReports(): Promise<GeneratedReport[]> {
  return (await readWorkspaceData()).reports;
}

export async function generateReport(title = "Metrix Yonetim Raporu"): Promise<GeneratedReport> {
  const data = await readWorkspaceData();
  const overdue = data.collections.filter((item) => item.status.toLowerCase().includes("gec"));
  const openGoals = data.goals.filter((item) => item.status.toLowerCase() !== "tamamlandi");
  const report: GeneratedReport = {
    id: makeId("rep"),
    title,
    summary: [
      // Musteri sayisi kasitli olarak burada yok: bu rapor demo/localStorage
      // workspace verisini okuyor, Musteriler ekrani ise artik /api/customers
      // (gercek DB) kullaniyor. Ikisi ayni sayiyi vermeyecegi icin yanlis
      // musteri sayisi raporlamak yerine bu cumleden cikarildi.
      `${data.offers.length} teklif ve ${openGoals.length} acik hedef izleniyor.`,
      overdue.length
        ? `${overdue.length} tahsilat kalemi risk tasiyor.`
        : "Gecikmis tahsilat kalemi gorunmuyor.",
      "Bu rapor demo modda uretildi; AI tool execution icin ayni adapter uzerinden genisletilecek.",
    ].join(" "),
    source: "Metrix workspace adapter",
    createdAt: now(),
  };

  await updateWorkspace((current) => ({ ...current, reports: [report, ...current.reports] }));
  return report;
}

export async function suggestTemplatesByIndustry(industry: string): Promise<ReportTemplate[]> {
  const normalized = industry.trim().toLowerCase();
  const templates = await readTemplates();
  if (!normalized) return templates.slice(0, 3);

  const exact = templates.filter((template) => template.industry.toLowerCase() === normalized);
  return exact.length ? exact : templates.filter((template) => template.industry.includes(normalized));
}
