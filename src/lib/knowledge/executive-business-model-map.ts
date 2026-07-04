// ─── Executive Business Model Map V1 ─────────────────────────────────────────
//
// Kilitli iş modeli listesi. NOT: B2B/B2C iş modeli değildir — customer_type key'idir.
// Yeni model eklenebilir, mevcut ID'ler değişmez.
// Prisma import yok. DB bağımlılığı yok.

import type { BusinessModelFamily } from "./executive-knowledge-registry.types";

export const BUSINESS_MODEL_MAP: BusinessModelFamily[] = [
  {
    id: "TRADING",
    label: "Alım-Satım / Ticaret",
    description: "Ürün alıp satan, stok tutan, marj üzerinden kazanan işletmeler.",
    matchKeywords: ["alım satım", "alim satim", "ticaret", "toptan", "distribütör", "toptanci", "ithalat", "ihracat"],
    primaryIndustries: ["TICARET", "TARIM_HAYVANCILIK"],
    criticalL2Keys: [
      { key: "inventory_level", priority: "HIGH" },
      { key: "total_receivables", priority: "HIGH" },
      { key: "average_margin", priority: "HIGH" },
    ],
    packKeys: ["product_groups", "supplier_count", "inventory_level", "inventory_turnover", "average_margin"],
  },
  {
    id: "RETAIL",
    label: "Perakende Satış",
    description: "Son tüketiciye doğrudan satan, mağaza veya online kanal kullanan işletmeler.",
    matchKeywords: ["perakende", "mağaza", "magaza", "son tüketici", "son tuketici", "e-ticaret", "online satış"],
    primaryIndustries: ["PERAKENDE", "E_TICARET"],
    criticalL2Keys: [
      { key: "inventory_level", priority: "HIGH" },
      { key: "average_margin", priority: "HIGH" },
      { key: "monthly_capacity", priority: "MEDIUM" },
    ],
    packKeys: ["product_groups", "supplier_count", "inventory_level", "inventory_turnover", "average_margin"],
  },
  {
    id: "MANUFACTURING",
    label: "Üretim / İmalat",
    description: "Ham madde veya yarı mamul kullanarak ürün üreten işletmeler.",
    matchKeywords: ["üretim", "uretim", "imalat", "fabrika", "atölye", "atolye", "üretiyoruz", "uretiyoruz"],
    primaryIndustries: ["URETIM", "TARIM_HAYVANCILIK"],
    criticalL2Keys: [
      { key: "monthly_production_capacity", priority: "HIGH" },
      { key: "capacity_utilization", priority: "HIGH" },
      { key: "scrap_rate", priority: "MEDIUM" },
      { key: "monthly_fixed_cost", priority: "HIGH" },
    ],
    packKeys: ["monthly_production_capacity", "production_method", "critical_machines", "scrap_rate"],
  },
  {
    id: "PROJECT",
    label: "Proje / Taahhüt",
    description: "Müşteri bazlı proje veya taahhüt üstlenen, iş başına faturalayan işletmeler.",
    matchKeywords: ["proje", "taahhüt", "taahhut", "müteahhit", "muteahhit", "inşaat", "insaat", "sözleşme", "sozlesme"],
    primaryIndustries: ["INSAAT_TAAHHUT", "MIMARLIK_PROJE"],
    criticalL2Keys: [
      { key: "active_project_count", priority: "HIGH" },
      { key: "total_receivables", priority: "HIGH" },
      { key: "project_capacity", priority: "HIGH" },
      { key: "overdue_receivables", priority: "HIGH" },
    ],
    packKeys: ["active_project_count", "average_project_duration", "project_capacity"],
  },
  {
    id: "SERVICE",
    label: "Hizmet",
    description: "Bilgi, uzmanlık veya işgücü sunarak hizmet veren işletmeler.",
    matchKeywords: ["hizmet", "danışmanlık", "danismanlik", "muhasebe", "hukuk", "servis", "destek", "consulting"],
    primaryIndustries: ["PROFESYONEL_HIZMETLER", "SAGLIK", "EGITIM", "TEKNIK_SERVIS", "MIMARLIK_PROJE"],
    criticalL2Keys: [
      { key: "appointment_capacity", priority: "HIGH" },
      { key: "service_utilization", priority: "HIGH" },
      { key: "total_receivables", priority: "HIGH" },
    ],
    packKeys: ["appointment_capacity", "expert_count", "service_utilization"],
  },
  {
    id: "BROKERAGE",
    label: "Aracılık / Komisyon",
    description: "Alıcı ile satıcıyı buluşturarak komisyon veya aracılık ücreti kazanan işletmeler.",
    matchKeywords: ["komisyon", "aracılık", "aracilik", "broker", "emlak", "sigorta acentesi", "acente"],
    primaryIndustries: ["GAYRIMENKUL", "FINANS_SIGORTA"],
    criticalL2Keys: [
      { key: "portfolio_count", priority: "HIGH" },
      { key: "conversion_rate", priority: "HIGH" },
      { key: "average_commission", priority: "HIGH" },
    ],
    packKeys: ["portfolio_count", "conversion_rate", "average_commission"],
  },
  {
    id: "SUBSCRIPTION",
    label: "Abonelik / Tekrarlayan Gelir",
    description: "Aylık veya yıllık ücret karşılığı hizmet veya ürün sunan, MRR odaklı işletmeler.",
    matchKeywords: ["abonelik", "saas", "aylık ücret", "aylik ucret", "lisans", "üyelik", "uyelik", "recurring"],
    primaryIndustries: ["YAZILIM_TEKNOLOJI", "EGITIM", "MEDYA_PAZARLAMA"],
    criticalL2Keys: [
      { key: "subscriber_count", priority: "HIGH" },
      { key: "monthly_recurring_revenue", priority: "HIGH" },
      { key: "churn_rate", priority: "HIGH" },
    ],
    packKeys: ["subscriber_count", "monthly_recurring_revenue", "churn_rate"],
  },
  {
    id: "RENTAL",
    label: "Kiralama / Varlık Geliri",
    description: "Sahip olduğu varlıkları (gayrimenkul, ekipman, araç) kiralayan işletmeler.",
    matchKeywords: ["kiralama", "kira", "rent", "kiralıyoruz", "kiralamak", "apart", "depo kiralama"],
    primaryIndustries: ["GAYRIMENKUL", "LOJISTIK"],
    criticalL2Keys: [
      { key: "asset_count", priority: "HIGH" },
      { key: "occupancy_rate", priority: "HIGH" },
      { key: "average_rental_income", priority: "HIGH" },
    ],
    packKeys: ["asset_count", "occupancy_rate", "average_rental_income"],
  },
  {
    id: "LOGISTICS",
    label: "Lojistik / Taşımacılık",
    description: "Mal veya kişi taşıyan, rota yönetimi yapan, filo kullanan işletmeler.",
    matchKeywords: ["lojistik", "taşımacılık", "tasimacilık", "kargo", "nakliye", "kurye", "filo", "sevkiyat"],
    primaryIndustries: ["LOJISTIK"],
    criticalL2Keys: [
      { key: "fleet_size", priority: "HIGH" },
      { key: "delivery_capacity", priority: "HIGH" },
      { key: "route_density", priority: "MEDIUM" },
      { key: "vehicle_count", priority: "HIGH" },
    ],
    packKeys: ["fleet_size", "route_density", "delivery_capacity"],
  },
  {
    id: "HOSPITALITY",
    label: "Konaklama / Yeme-İçme",
    description: "Oda, masa veya alan kiralayan; ağırlama, yemek, eğlence hizmeti sunan işletmeler.",
    matchKeywords: ["otel", "restoran", "kafe", "cafe", "konaklama", "yemek", "mutfak", "ağırlama", "agırlama"],
    primaryIndustries: ["TURIZM_KONAKLAMA", "YEME_ICME"],
    criticalL2Keys: [
      { key: "room_table_capacity", priority: "HIGH" },
      { key: "occupancy_rate", priority: "HIGH" },
      { key: "average_guest_revenue", priority: "HIGH" },
      { key: "monthly_fixed_cost", priority: "HIGH" },
    ],
    packKeys: ["room_table_capacity", "occupancy_rate", "average_guest_revenue"],
  },
  {
    id: "WORKFORCE",
    label: "İşgücü / Hizmet Sağlayıcı",
    description: "Sözleşmeli personel, güvenlik, temizlik, teknik servis gibi insan gücü üreten işletmeler.",
    matchKeywords: ["güvenlik", "guvenlik", "temizlik", "personel sağlama", "personel saglama", "field service", "saha hizmet"],
    primaryIndustries: ["GUVENLIK_TEMIZLIK", "TEKNIK_SERVIS"],
    criticalL2Keys: [
      { key: "field_staff_count", priority: "HIGH" },
      { key: "contract_count", priority: "HIGH" },
      { key: "billable_capacity", priority: "HIGH" },
      { key: "employee_count", priority: "HIGH" },
    ],
    packKeys: ["field_staff_count", "contract_count", "billable_capacity"],
  },
];

export function getBusinessModelDefinition(id: string): BusinessModelFamily | undefined {
  return BUSINESS_MODEL_MAP.find((model) => model.id === id);
}

export function resolveBusinessModelFamily(businessModelValue: string): BusinessModelFamily {
  const normalized = businessModelValue.trim().toLocaleLowerCase("tr-TR");
  return (
    BUSINESS_MODEL_MAP.find((model) =>
      model.matchKeywords.some((kw) => normalized.includes(kw)),
    ) ?? buildUnknownBusinessModelFamily()
  );
}

export function listBusinessModelIds(): string[] {
  return BUSINESS_MODEL_MAP.map((m) => m.id);
}

function buildUnknownBusinessModelFamily(): BusinessModelFamily {
  return {
    id: "UNKNOWN",
    label: "Belirtilmemiş",
    description: "İş modeli henüz tanımlanmamış.",
    matchKeywords: [],
    primaryIndustries: [],
    criticalL2Keys: [],
    packKeys: [],
  };
}
