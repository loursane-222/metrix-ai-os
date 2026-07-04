// Executive Reasoning — Executive Operating System içinde üretilen yönetici muhakemesi modelidir.
// Yönetici muhakemesini temsil eder ve Recommended Next Move'un oluşmasını sağlayan temel düşünme yapısıdır.
//
// Contract garantileri:
//   - evidence, risks, priorities, opportunities: boş dizi geçerlidir; null/undefined değil.
//   - tradeOffs: birden fazla gerilim boyutu olabilir; tekli varsayım yapılmaz.
//   - confidence: 0–1 aralığında ondalıklı sayı. 0 = muhakeme üretilmedi, 1 = tam güven.
//   - evidenceIds çapraz referansları: ilgili evidence[].id değerlerine işaret eder.

export type EvidenceWeight = "weak" | "moderate" | "strong";
export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type Reversibility = "reversible" | "hard_to_reverse" | "irreversible" | "unknown";
export type ImpactMagnitude = "low" | "medium" | "high";
export type OrganizationalScope = "individual" | "team" | "department" | "company_wide";
export type TimingUrgency = "immediate" | "today" | "this_week" | "this_month" | "no_urgency";

export type ReasoningEvidence = {
  id: string;
  claim: string;
  source: string;
  weight: EvidenceWeight;
};

export type ReasoningRisk = {
  id: string;
  title: string;
  explanation: string;
  severity: RiskSeverity;
  reversibility: Reversibility;
  evidenceIds: string[];
};

export type ReasoningPriority = {
  id: string;
  title: string;
  rationale: string;
  impact: ImpactMagnitude;
  evidenceIds: string[];
};

export type ReasoningOpportunity = {
  id: string;
  title: string;
  explanation: string;
  impact: ImpactMagnitude;
  evidenceIds: string[];
};

export type TimingAssessment = {
  urgency: TimingUrgency;
  delayConsequence: string | null;
  optimalActionWindow: string | null;
};

export type OrganizationalImpact = {
  scope: OrganizationalScope;
  affectedAreas: string[];
  peopleImplications: string | null;
};

export type TradeOffOption = {
  label: string;
  upside: string;
  downside: string;
};

export type TradeOffAssessment = {
  dimension: string;
  options: TradeOffOption[];
  recommendedPath: string | null;
};

export type ExecutiveReasoning = {
  evidence: ReasoningEvidence[];
  risks: ReasoningRisk[];
  priorities: ReasoningPriority[];
  opportunities: ReasoningOpportunity[];
  timing: TimingAssessment;
  organizationalImpact: OrganizationalImpact;
  /** Birden fazla gerilim boyutu olabilir; boş dizi "trade-off analizi yapılmadı" anlamına gelir. */
  tradeOffs: TradeOffAssessment[];
  /** 0–1 aralığında. 0 = muhakeme henüz üretilmedi, 1 = tam güven. */
  confidence: number;
  summary: string;
};

export const REASONING_PLACEHOLDER: ExecutiveReasoning = {
  evidence: [],
  risks: [],
  priorities: [],
  opportunities: [],
  timing: {
    urgency: "no_urgency",
    delayConsequence: null,
    optimalActionWindow: null,
  },
  organizationalImpact: {
    scope: "individual",
    affectedAreas: [],
    peopleImplications: null,
  },
  tradeOffs: [],
  confidence: 0,
  summary: "Reasoning henüz üretilmedi.",
};
