// Şirkete özel öğrenilebilir bilgi alanı.
// Şimdilik read-only/mock; gerçek doldurma bir sonraki fazda memory'den beslenir.

export type CompanyModelConfidence = "none" | "low" | "medium" | "high";

export type CompanyModelFact = {
  key: string;
  value: string;
  confidence: CompanyModelConfidence;
  source: "memory" | "onboarding" | "inferred" | "opinion" | "unknown";
  epistemicType: EpistemicType;
  truthBoundary: TruthBoundary;
  isCanonicalFact: boolean;
};

export type CompanyGrowthPhase =
  | "unknown"
  | "pre_revenue"
  | "early_growth"
  | "scaling"
  | "mature"
  | "turnaround";

export type CompanyModel = {
  industry: string | null;
  city: string | null;
  teamSize: number | null;
  growthPhase: CompanyGrowthPhase;
  topGoal: string | null;
  cashPriority: string | null;
  primaryCustomerType: string | null;
  learnedFacts: CompanyModelFact[];
  confidence: CompanyModelConfidence;
};

export const EMPTY_COMPANY_MODEL: CompanyModel = {
  industry: null,
  city: null,
  teamSize: null,
  growthPhase: "unknown",
  topGoal: null,
  cashPriority: null,
  primaryCustomerType: null,
  learnedFacts: [],
  confidence: "none",
};

// ─── Executive Company Model ──────────────────────────────────────────────────
// Şirkete özgü değil; evrensel yönetim framework boyutlarını tanımlar.
// GM muhakemesini besleyen referans model. Runtime'da değişmez.

export type ExecutiveCompanyModelDimension = {
  id: string;
  label: string;
  description: string;
  executiveSignal: string;
};

export type ExecutiveCompanyModel = {
  revenueModel: ExecutiveCompanyModelDimension;
  costStructure: ExecutiveCompanyModelDimension;
  cashConversion: ExecutiveCompanyModelDimension;
  growthEngine: ExecutiveCompanyModelDimension;
  customerEconomics: ExecutiveCompanyModelDimension;
  operationalComplexity: ExecutiveCompanyModelDimension;
  decisionVelocity: ExecutiveCompanyModelDimension;
  organizationalScalability: ExecutiveCompanyModelDimension;
  riskConcentration: ExecutiveCompanyModelDimension;
  dependencyStructure: ExecutiveCompanyModelDimension;
};

export const EXECUTIVE_COMPANY_MODEL: ExecutiveCompanyModel = {
  revenueModel: {
    id: "revenue-model",
    label: "Gelir Modeli",
    description: "Şirketin nasıl para kazandığını tanımlar: tekrar eden mi, proje bazlı mı, ürün satışı mı?",
    executiveSignal: "Tekrarlayan gelir öngörülebilirlik yaratır; proje bazlı gelir nakit dalgalanması yaratır. Model değiştikçe nakit akışı profili değişir.",
  },
  costStructure: {
    id: "cost-structure",
    label: "Maliyet Yapısı",
    description: "Sabit ve değişken maliyetlerin oranı; ölçek ekonomisi potansiyeli.",
    executiveSignal: "Sabit maliyet ağırlıklı yapılarda gelir düşüşü marjı hızla baskılar. Değişken yapılarda büyüme kararı daha esnektir.",
  },
  cashConversion: {
    id: "cash-conversion",
    label: "Nakit Dönüşüm Döngüsü",
    description: "Satış gerçekleşmesinden kasaya para girmesine kadar geçen süre.",
    executiveSignal: "Dönüşüm döngüsü uzadıkça işletme sermayesi ihtiyacı artar. 30 günü aşan döngüler finansman riskini tetikler.",
  },
  growthEngine: {
    id: "growth-engine",
    label: "Büyüme Motoru",
    description: "Büyüme nasıl üretiliyor: referans, satış ekibi, pazarlama, kanal, ürün odaklı?",
    executiveSignal: "Büyüme motoru tek kanala bağlıysa risk konsantrasyonu yüksektir. Motorun ölçeklenebilirliği büyüme kararlarını kısıtlar.",
  },
  customerEconomics: {
    id: "customer-economics",
    label: "Müşteri Ekonomisi",
    description: "Müşteri edinim maliyeti, yaşam boyu değer, kayıp oranı ve geri dönüş hızı.",
    executiveSignal: "LTV/CAC oranı 3'ün altındaysa büyüme sürdürülemez. Yüksek churn gelir tavanı yaratır.",
  },
  operationalComplexity: {
    id: "operational-complexity",
    label: "Operasyonel Karmaşıklık",
    description: "İş teslimatının kaç bağımlı adımı var; koordinasyon yükü ne kadar?",
    executiveSignal: "Yüksek karmaşıklık ölçeği yavaşlatır ve hata riskini artırır. Süreç tanımı olmadan karmaşıklık kaos üretir.",
  },
  decisionVelocity: {
    id: "decision-velocity",
    label: "Karar Hızı",
    description: "Operasyonel ve stratejik kararların ne hızda alındığı; karar döngüsünün uzunluğu.",
    executiveSignal: "Yavaş karar hızı pazar fırsatlarını kaçırır. Hızlı ama bilgisiz kararlar tersine döndürülemez sonuçlar doğurur.",
  },
  organizationalScalability: {
    id: "organizational-scalability",
    label: "Organizasyonel Ölçeklenebilirlik",
    description: "Ekip yapısının büyüme yükünü taşıyıp taşıyamayacağı; süreç olgunluğu.",
    executiveSignal: "Kişiye bağımlı yapılar ölçeklenemez. Rol netliği olmadan büyüme koordinasyon çöküşü yaratır.",
  },
  riskConcentration: {
    id: "risk-concentration",
    label: "Risk Konsantrasyonu",
    description: "Gelir, müşteri, tedarikçi veya yetenek bazında tekil bağımlılık noktaları.",
    executiveSignal: "Tek bir müşteri, tedarikçi veya kişiden %30+ bağımlılık yönetim önceliği gerektirir.",
  },
  dependencyStructure: {
    id: "dependency-structure",
    label: "Bağımlılık Yapısı",
    description: "Dış bağımlılıklar: tedarikçi, teknoloji, düzenleyici, pazar koşulu.",
    executiveSignal: "Bağımlılık haritası çıkarılmadan kriz yönetimi reaktif kalır.",
  },
};
import type { EpistemicType, TruthBoundary } from "@/lib/executive-knowledge-authority";
