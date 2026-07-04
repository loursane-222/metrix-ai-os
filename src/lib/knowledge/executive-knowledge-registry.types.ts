// ─── Executive Knowledge Registry V1 — Type Definitions ─────────────────────
//
// Bu dosya saf tip tanımlarıdır.
// Prisma import yok. DB bağımlılığı yok. Dış import yok.
// Sync: MemoryItemType, MemorySubjectType (prisma/schema.prisma) ile uyumlu tutulmalı.

export type KnowledgeLevel = 1 | 2 | 3;
// 1 = Foundation — Kim olduğunu, ne yaptığını anlatan kritik yönetim bilgileri
// 2 = Operational — Şu anki durumu gösteren operasyonel yönetim bilgileri
// 3 = Strategic — Nereye gittiğini anlatan stratejik bilgiler

export type KnowledgeMemoryType =
  | "FACT"        // Ölçülebilir veya doğrulanabilir gerçek bilgi
  | "PREFERENCE"  // Tercih, çalışma stili, karar tarzı
  | "PROCESS"     // Süreç, zorluk, darboğaz, sorun
  | "STRATEGIC";  // Hedef, vizyon, strateji, büyüme planı

export type KnowledgeSubjectType =
  | "ORGANIZATION" // Şirkete ait bilgi
  | "USER"         // Yöneticiye / kullanıcıya ait bilgi
  | "PROCESS"      // Operasyonel sürece ait bilgi
  | "STRATEGY";    // Stratejik plana ait bilgi

export type KnowledgePriority = "HIGH" | "MEDIUM" | "LOW";

export type DecisionCategory =
  | "PRICING"
  | "COLLECTION"
  | "TEAM"
  | "CUSTOMER_CONFLICT"
  | "SALES"
  | "OPERATIONS"
  | "STRATEGY"
  | "PERSONAL"
  | "HIRING"
  | "CASHFLOW"
  | "GENERAL";

export type AcquisitionMode =
  | "ONBOARDING"       // Onboarding cevabından doğrudan
  | "CONVERSATION"     // Sohbet sırasında kural/tespit ile
  | "USER_CORRECTION"  // Kullanıcı mevcut bilgiyi düzeltir
  | "INFERENCE"        // Sistem çıkarımı (SYSTEM_INFERRED)
  | "IMPORT"           // Dış veri kaynağından (ör. paymentContext)
  | "BRIEFING";        // Sabah brifinginden

// "ALL" = tüm sektörler/modeller için geçerli
// string[] = yalnızca bu ID'lere sahip sektörler/modeller için
export type IndustryApplicability = "ALL" | string[];
export type BusinessModelApplicability = "ALL" | string[];

export type KnowledgeKeyEntry = {
  key: string;                                      // canonical DB key
  aliases: string[];                                // mevcut sistemdeki eski isimler
  label: string;                                    // Türkçe kısa ad (UI + prompt)
  description: string;                              // ne anlama gelir
  level: KnowledgeLevel;
  memoryType: KnowledgeMemoryType;
  subjectType: KnowledgeSubjectType;
  priority: KnowledgePriority;
  industryApplicability: IndustryApplicability;
  businessModelApplicability: BusinessModelApplicability;
  requiredForDecision: DecisionCategory[];
  acquisitionModes: AcquisitionMode[];
  defaultConfidence: number;                        // 0.0 – 1.0
  defaultIsAssumption: boolean;
  suggestedQuestion: string;                        // learning loop + acquisition engine
  reason: string;                                   // neden kritik
  hasExistingMemoryKey: boolean;                    // mevcut sistemde DB key'i var mı
  existingMemoryKeyName?: string;                   // varsa mevcut canonical adı
};

export type IndustryKeyOverride = {
  key: string;
  priority: KnowledgePriority;
};

export type IndustryFamily = {
  id: string;                                       // büyük harf + alt çizgi (ör: URETIM)
  label: string;                                    // Türkçe görünen ad
  matchKeywords: string[];                          // memory'deki industry değerini eşleştirmek için
  suggestedBusinessModels: string[];                // bu sektörde yaygın iş modeli ID'leri
  criticalKeyOverrides: IndustryKeyOverride[];      // bu sektörde priority'si değişen key'ler
};

export type BusinessModelKeyOverride = {
  key: string;
  priority: KnowledgePriority;
};

export type BusinessModelFamily = {
  id: string;                                       // büyük harf (ör: TRADING)
  label: string;                                    // Türkçe görünen ad
  description: string;
  matchKeywords: string[];                          // business_model memory değerini eşleştirmek için
  primaryIndustries: string[];                      // tipik sektör ID'leri
  criticalL2Keys: BusinessModelKeyOverride[];       // bu modelde kritik olan L2 key'ler
  packKeys: string[];                               // bu modele özgü ek knowledge key'leri
};

export type KnowledgeGapScore = {
  criticalGaps: string[];    // eksik L1 key'ler — CRITICAL
  highGaps: string[];        // eksik criticalL2 key'ler — HIGH
  mediumGaps: string[];      // eksik diğer L2 key'ler — MEDIUM
  lowGaps: string[];         // eksik L3 key'ler — LOW
  completionRatio: number;   // 0.0 – 1.0
  overallReadiness:
    | "BLIND"          // L1'in yarısından fazlası eksik
    | "INSUFFICIENT"   // L1'den en az 1 eksik
    | "PARTIAL"        // criticalL2'den 2+ eksik
    | "READY"          // criticalL2'den 1 eksik
    | "COMPLETE";      // hiç gap yok
};
