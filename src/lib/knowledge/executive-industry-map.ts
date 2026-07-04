// ─── Executive Industry Map V1 ────────────────────────────────────────────────
//
// Kilitli sektör listesi. Yeni sektör eklenebilir, mevcut ID'ler değişmez.
// Prisma import yok. DB bağımlılığı yok.

import type { IndustryFamily } from "./executive-knowledge-registry.types";

export const INDUSTRY_MAP: IndustryFamily[] = [
  {
    id: "TICARET",
    label: "Ticaret",
    matchKeywords: ["ticaret", "toptan", "toptancı", "ihracat", "ithalat", "dağıtım", "dagitim", "distribütör"],
    suggestedBusinessModels: ["TRADING"],
    criticalKeyOverrides: [
      { key: "inventory_level", priority: "HIGH" },
      { key: "supplier_count", priority: "HIGH" },
      { key: "average_margin", priority: "HIGH" },
    ],
  },
  {
    id: "PERAKENDE",
    label: "Perakende",
    matchKeywords: ["perakende", "mağaza", "magaza", "dükkan", "dukkan", "market", "kırtasiye", "kirtasiye"],
    suggestedBusinessModels: ["RETAIL"],
    criticalKeyOverrides: [
      { key: "monthly_capacity", priority: "HIGH" },
      { key: "inventory_level", priority: "HIGH" },
      { key: "average_margin", priority: "HIGH" },
    ],
  },
  {
    id: "E_TICARET",
    label: "E-Ticaret",
    matchKeywords: ["e-ticaret", "eticaret", "online satış", "online satis", "e-commerce", "dijital satış"],
    suggestedBusinessModels: ["RETAIL", "SUBSCRIPTION"],
    criticalKeyOverrides: [
      { key: "conversion_rate", priority: "HIGH" },
      { key: "active_customer_count", priority: "HIGH" },
      { key: "average_margin", priority: "HIGH" },
    ],
  },
  {
    id: "URETIM",
    label: "Üretim",
    matchKeywords: ["üretim", "uretim", "imalat", "fabrika", "üretici", "uretici", "atölye", "atolye"],
    suggestedBusinessModels: ["MANUFACTURING"],
    criticalKeyOverrides: [
      { key: "monthly_production_capacity", priority: "HIGH" },
      { key: "scrap_rate", priority: "HIGH" },
      { key: "critical_machines", priority: "HIGH" },
      { key: "monthly_fixed_cost", priority: "HIGH" },
    ],
  },
  {
    id: "INSAAT_TAAHHUT",
    label: "İnşaat ve Taahhüt",
    matchKeywords: ["inşaat", "insaat", "taahhüt", "taahhut", "müteahhit", "muteahhit", "yüklenici", "yuklenici"],
    suggestedBusinessModels: ["PROJECT"],
    criticalKeyOverrides: [
      { key: "total_receivables", priority: "HIGH" },
      { key: "overdue_receivables", priority: "HIGH" },
      { key: "active_project_count", priority: "HIGH" },
      { key: "employee_count", priority: "HIGH" },
    ],
  },
  {
    id: "MIMARLIK_PROJE",
    label: "Mimarlık / Mühendislik / Proje",
    matchKeywords: ["mimarlık", "mimarlik", "mühendislik", "muhendislik", "proje", "tasarım", "tasarim"],
    suggestedBusinessModels: ["PROJECT", "SERVICE"],
    criticalKeyOverrides: [
      { key: "active_project_count", priority: "HIGH" },
      { key: "project_capacity", priority: "HIGH" },
      { key: "expert_count", priority: "HIGH" },
    ],
  },
  {
    id: "GAYRIMENKUL",
    label: "Gayrimenkul",
    matchKeywords: ["gayrimenkul", "emlak", "kiralama", "kira", "konut", "arazi", "taşınmaz", "tasinmaz"],
    suggestedBusinessModels: ["RENTAL", "BROKERAGE"],
    criticalKeyOverrides: [
      { key: "asset_count", priority: "HIGH" },
      { key: "occupancy_rate", priority: "HIGH" },
      { key: "average_rental_income", priority: "HIGH" },
      { key: "portfolio_count", priority: "HIGH" },
    ],
  },
  {
    id: "YAZILIM_TEKNOLOJI",
    label: "Yazılım ve Teknoloji",
    matchKeywords: ["yazılım", "yazilim", "teknoloji", "saas", "uygulama", "app", "platform", "dijital"],
    suggestedBusinessModels: ["SUBSCRIPTION", "SERVICE"],
    criticalKeyOverrides: [
      { key: "subscriber_count", priority: "HIGH" },
      { key: "monthly_recurring_revenue", priority: "HIGH" },
      { key: "churn_rate", priority: "HIGH" },
      { key: "one_year_goal", priority: "HIGH" },
    ],
  },
  {
    id: "PROFESYONEL_HIZMETLER",
    label: "Profesyonel Hizmetler",
    matchKeywords: ["danışmanlık", "danismanlik", "danışman", "danisman", "hukuk", "muhasebe", "mali müşavir", "mali musavir", "denetim"],
    suggestedBusinessModels: ["SERVICE", "PROJECT"],
    criticalKeyOverrides: [
      { key: "active_customer_count", priority: "HIGH" },
      { key: "total_receivables", priority: "HIGH" },
      { key: "expert_count", priority: "HIGH" },
    ],
  },
  {
    id: "SAGLIK",
    label: "Sağlık",
    matchKeywords: ["sağlık", "saglik", "hastane", "klinik", "doktor", "poliklinik", "eczane", "tıbbi", "tibbi"],
    suggestedBusinessModels: ["SERVICE", "SUBSCRIPTION"],
    criticalKeyOverrides: [
      { key: "appointment_capacity", priority: "HIGH" },
      { key: "service_utilization", priority: "HIGH" },
      { key: "expert_count", priority: "HIGH" },
    ],
  },
  {
    id: "EGITIM",
    label: "Eğitim",
    matchKeywords: ["eğitim", "egitim", "okul", "kurs", "akademi", "özel ders", "ozel ders", "koçluk", "kocluk"],
    suggestedBusinessModels: ["SERVICE", "SUBSCRIPTION"],
    criticalKeyOverrides: [
      { key: "subscriber_count", priority: "HIGH" },
      { key: "appointment_capacity", priority: "HIGH" },
      { key: "service_utilization", priority: "HIGH" },
    ],
  },
  {
    id: "TURIZM_KONAKLAMA",
    label: "Turizm ve Konaklama",
    matchKeywords: ["turizm", "otel", "pansiyon", "tatil", "konaklama", "apart", "resort", "tur"],
    suggestedBusinessModels: ["HOSPITALITY", "RENTAL"],
    criticalKeyOverrides: [
      { key: "room_table_capacity", priority: "HIGH" },
      { key: "occupancy_rate", priority: "HIGH" },
      { key: "average_guest_revenue", priority: "HIGH" },
      { key: "seasonality", priority: "HIGH" },
    ],
  },
  {
    id: "YEME_ICME",
    label: "Yeme İçme",
    matchKeywords: ["restoran", "kafe", "cafe", "yemek", "mutfak", "pizza", "fastfood", "catering", "kafeterya"],
    suggestedBusinessModels: ["HOSPITALITY"],
    criticalKeyOverrides: [
      { key: "room_table_capacity", priority: "HIGH" },
      { key: "monthly_fixed_cost", priority: "HIGH" },
      { key: "average_guest_revenue", priority: "HIGH" },
      { key: "employee_count", priority: "HIGH" },
    ],
  },
  {
    id: "LOJISTIK",
    label: "Lojistik ve Taşımacılık",
    matchKeywords: ["lojistik", "taşımacılık", "tasimacilık", "kargo", "nakliye", "kurye", "sevkiyat", "depo"],
    suggestedBusinessModels: ["LOGISTICS"],
    criticalKeyOverrides: [
      { key: "fleet_size", priority: "HIGH" },
      { key: "delivery_capacity", priority: "HIGH" },
      { key: "route_density", priority: "HIGH" },
      { key: "vehicle_count", priority: "HIGH" },
    ],
  },
  {
    id: "TARIM_HAYVANCILIK",
    label: "Tarım ve Hayvancılık",
    matchKeywords: ["tarım", "tarim", "hayvancılık", "hayvancilik", "çiftlik", "ciftlik", "arazi", "seracılık", "seracilik"],
    suggestedBusinessModels: ["TRADING", "MANUFACTURING"],
    criticalKeyOverrides: [
      { key: "seasonality", priority: "HIGH" },
      { key: "monthly_capacity", priority: "HIGH" },
      { key: "inventory_level", priority: "HIGH" },
    ],
  },
  {
    id: "ENERJI",
    label: "Enerji",
    matchKeywords: ["enerji", "güneş", "gunes", "solar", "rüzgar", "ruzgar", "elektrik", "doğalgaz", "dogalgaz", "akaryakıt"],
    suggestedBusinessModels: ["SERVICE", "SUBSCRIPTION"],
    criticalKeyOverrides: [
      { key: "monthly_capacity", priority: "HIGH" },
      { key: "monthly_fixed_cost", priority: "HIGH" },
      { key: "property_count", priority: "HIGH" },
    ],
  },
  {
    id: "MEDYA_PAZARLAMA",
    label: "Medya ve Pazarlama",
    matchKeywords: ["medya", "pazarlama", "reklam", "ajans", "sosyal medya", "influencer", "içerik", "icerik", "yayın"],
    suggestedBusinessModels: ["SERVICE", "SUBSCRIPTION"],
    criticalKeyOverrides: [
      { key: "active_customer_count", priority: "HIGH" },
      { key: "portfolio_count", priority: "HIGH" },
      { key: "conversion_rate", priority: "HIGH" },
    ],
  },
  {
    id: "TEKNIK_SERVIS",
    label: "Teknik Servis ve Bakım",
    matchKeywords: ["teknik servis", "bakım", "bakim", "onarım", "onarim", "tamir", "servis", "arıza", "ariza"],
    suggestedBusinessModels: ["SERVICE", "WORKFORCE"],
    criticalKeyOverrides: [
      { key: "field_staff_count", priority: "HIGH" },
      { key: "billable_capacity", priority: "HIGH" },
      { key: "service_utilization", priority: "HIGH" },
    ],
  },
  {
    id: "GUVENLIK_TEMIZLIK",
    label: "Güvenlik ve Temizlik",
    matchKeywords: ["güvenlik", "guvenlik", "temizlik", "koruma", "özel güvenlik", "özel guvenlik", "cleaning"],
    suggestedBusinessModels: ["WORKFORCE", "SERVICE"],
    criticalKeyOverrides: [
      { key: "field_staff_count", priority: "HIGH" },
      { key: "contract_count", priority: "HIGH" },
      { key: "billable_capacity", priority: "HIGH" },
      { key: "employee_count", priority: "HIGH" },
    ],
  },
  {
    id: "FINANS_SIGORTA",
    label: "Finans ve Sigorta",
    matchKeywords: ["finans", "sigorta", "banka", "kredi", "yatırım", "yatirim", "borsa", "fon", "leasing", "faktoring"],
    suggestedBusinessModels: ["BROKERAGE", "SERVICE"],
    criticalKeyOverrides: [
      { key: "portfolio_count", priority: "HIGH" },
      { key: "conversion_rate", priority: "HIGH" },
      { key: "average_commission", priority: "HIGH" },
    ],
  },
];

export function getIndustryDefinition(id: string): IndustryFamily | undefined {
  return INDUSTRY_MAP.find((family) => family.id === id);
}

export function resolveIndustryFamily(industryValue: string): IndustryFamily {
  const normalized = industryValue.trim().toLocaleLowerCase("tr-TR");
  return (
    INDUSTRY_MAP.find((family) =>
      family.matchKeywords.some((kw) => normalized.includes(kw)),
    ) ?? INDUSTRY_MAP[INDUSTRY_MAP.length - 1]! // FINANS_SIGORTA son değil, generic fallback yok
  ) ?? buildUnknownIndustryFamily();
}

export function listIndustryIds(): string[] {
  return INDUSTRY_MAP.map((f) => f.id);
}

function buildUnknownIndustryFamily(): IndustryFamily {
  return {
    id: "UNKNOWN",
    label: "Belirtilmemiş",
    matchKeywords: [],
    suggestedBusinessModels: [],
    criticalKeyOverrides: [],
  };
}
