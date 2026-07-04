import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

// ─── V2: Executive Context Model ─────────────────────────────────────────────
// GM bağlam çerçevesi. Modül seçmez, route önermez, CRM entity çıkarmaz.
// Konuşmadan yönetim kararı için gereken bağlamı çıkarır.

export type SituationWeight = "critical" | "routine" | "personal" | "unknown";

export type IntentClarity = "clear" | "ambiguous" | "contradictory";

export type TimeHorizon = "immediate" | "near_term" | "no_urgency" | "unknown";

export type StakeholderRole =
  | "customer"
  | "partner"
  | "team"
  | "external"
  | "unknown";

export type StakeholderSignal = {
  mentioned: string;
  role: StakeholderRole;
  confidence: "low" | "medium" | "high";
};

export type KnowledgeGap = {
  question: string;
  blocking: boolean;
};

export type ExecutiveContextV2 = {
  situationSummary: string;
  weight: SituationWeight;
  intentClarity: IntentClarity;
  timeHorizon: TimeHorizon;
  stakeholders: StakeholderSignal[];
  knowledgeGaps: KnowledgeGap[];
  canProceed: boolean;
  proceedRationale: string;
  assembledFrom: ConversationUnderstanding;
};

// ─── V1: Deprecated ──────────────────────────────────────────────────────────

/** @deprecated V2'de MetrixModule kaldırıldı. Context builder modül seçmez. */
export type MetrixModule =
  | "customers"
  | "offers"
  | "work_plan"
  | "collections"
  | "finance"
  | "products"
  | "team"
  | "goals"
  | "tasks"
  | "unknown";

/** @deprecated V2'de EntityType, Executive Context Builder'ın sorumluluğundan çıkarıldı. Varlık tanımlama gerekiyorsa bu görev Executive Brain'e aittir. */
export type EntityType =
  | "person"
  | "company"
  | "offer"
  | "customer"
  | "work_item"
  | "collection"
  | "unknown";

/** @deprecated V2'de ExtractionSource kaldırıldı. Context Builder varlık çıkarmaz; bu sorumluluk Executive Brain'e aittir. */
export type ExtractionSource =
  | "llm_extraction"
  | "understanding_derived"
  | "not_attempted";

export type ContextStatus =
  | "skipped"              // shouldInvokeExecutiveBrain false, işlem yapılmadı
  | "ready"                // context hazır, Executive Brain'e gönderilebilir
  | "needs_clarification"  // bağlam yetersiz, kullanıcıdan netleştirme gerekli
  | "not_enough_signal";   // understanding geldi ama context üretemedi

/** @deprecated V2'de DataAccess kaldırıldı. Context Builder veri erişimi planlamaz; sadece GM karar bağlamını üretir. */
export type DataAccess =
  | "none"           // bu fazda: hiçbir veri erişimi yapılmadı
  | "local_state"    // localStorage / client state
  | "database"       // Prisma / DB sorgusu
  | "external";      // harici API / servis

export type ExecutiveContextInput = {
  message: string;
  understanding: ConversationUnderstanding;
  organizationId?: string;
};

/** @deprecated V2'de ContextEntityCandidate kaldırıldı. Context Builder CRM kaydı çıkarmaya çalışmaz; varlık tanımlama Executive Brain'e aittir. */
export type ContextEntityCandidate = {
  rawMention: string;
  entityType: EntityType;
  confidence: "low" | "medium" | "high";
  moduleHint: MetrixModule;
  extractionSource: ExtractionSource;
};

/** @deprecated V2'de ContextNeed kaldırıldı. Context Builder modül seçmez, route önermez; sadece GM karar bağlamını üretir. */
export type ContextNeed = {
  module: MetrixModule;
  reason: string;
  priority: "essential" | "helpful" | "optional";
  dataAccess: DataAccess;
  entityRef?: string;
};

export type ContextAssemblyReasoning = {
  summary: string;
  whyProceed: string;
  entityDiscoveryMethod: ExtractionSource;
  needsIdentified: string[];
};

export type ExecutiveContext = {
  contextStatus: ContextStatus;
  shouldProceed: boolean;
  entityCandidates: ContextEntityCandidate[];
  contextNeeds: ContextNeed[];
  actionIntentSummary: string;
  topicSummary: string;
  assembledFrom: ConversationUnderstanding;
  reasoning: ContextAssemblyReasoning;
};
