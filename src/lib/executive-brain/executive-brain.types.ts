import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";

export type ExecutiveBrainSignal = {
  id?: string;
  key?: string;
  value?: string;
  text?: string;
  category?: string;
  source?: string;
  confidence?: number;
  createdAt?: string;
  evidenceRef?: string;
};

export type ExecutiveBrainSourceReliabilityLevel =
  | "UNAVAILABLE"
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type ExecutiveBrainSourceReliability = {
  source: string;
  reliability: ExecutiveBrainSourceReliabilityLevel;
  confidence: number;
  connected: boolean;
  reason: string;
  signalCount: number;
};

export type ExecutiveBrainContext = {
  now?: string | Date;
  ownerSignals?: ExecutiveBrainSignal[];
  companySignals?: ExecutiveBrainSignal[];
  customerSignals?: ExecutiveBrainSignal[];
  personnelSignals?: ExecutiveBrainSignal[];
  salesSignals?: ExecutiveBrainSignal[];
  financeSignals?: ExecutiveBrainSignal[];
  operationsSignals?: ExecutiveBrainSignal[];
  memorySignals?: ExecutiveBrainSignal[];
  sourceReliability?: ExecutiveBrainSourceReliability[];
};

export type BuildExecutiveBrainContextInput = {
  organizationId?: string | null;
  now?: string | Date;
  maxMemoryItems?: number;
  maxPeople?: number;
  maxEvents?: number;
};

export type ExecutiveBrainRecognitionDomain =
  | "owner"
  | "company"
  | "customers"
  | "personnel"
  | "operations"
  | "finance";

export type ExecutiveBrainRecognitionLabel =
  | "UNKNOWN"
  | "LOW"
  | "PARTIAL"
  | "STRONG"
  | "COMPLETE";

export type ExecutiveBrainRecognitionScore = {
  score: number;
  label: ExecutiveBrainRecognitionLabel;
  reason: string;
  missingSignals: string[];
};

export type ExecutiveBrainRecognition = Record<
  ExecutiveBrainRecognitionDomain,
  ExecutiveBrainRecognitionScore
>;

export type ExecutiveBrainHealthState =
  | "UNKNOWN"
  | "STABLE"
  | "WATCH"
  | "RISK"
  | "CRITICAL";

export type ExecutiveBrainCompanyHealth = {
  overallState: ExecutiveBrainHealthState;
  cashState: ExecutiveBrainHealthState;
  salesState: ExecutiveBrainHealthState;
  operationsState: ExecutiveBrainHealthState;
  peopleState: ExecutiveBrainHealthState;
  summary: string;
};

export type ExecutiveBrainSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ExecutiveBrainImpact = "LOW" | "MEDIUM" | "HIGH";

export type GrowthStrategy =
  | "UNKNOWN"
  | "aggressive_growth"
  | "controlled_growth"
  | "profitability_first_growth"
  | "customer_depth_growth"
  | "operational_capacity_first";

export type RiskTolerance = "UNKNOWN" | "low" | "medium" | "high" | "contextual";

export type ManagementStyle =
  | "UNKNOWN"
  | "hands_on"
  | "delegating"
  | "relationship_driven"
  | "data_driven"
  | "urgency_driven"
  | "balanced";

export type CustomerStrategy =
  | "UNKNOWN"
  | "strategic_account_focus"
  | "broad_customer_acquisition"
  | "retention_first"
  | "premium_customer_focus"
  | "cash_safe_customer_management";

export type PeopleStrategy =
  | "UNKNOWN"
  | "lean_team"
  | "growth_team"
  | "training_first"
  | "performance_first"
  | "culture_first"
  | "role_fit_first";

export type FinancialStrategy =
  | "UNKNOWN"
  | "cash_preservation"
  | "profitability_first"
  | "growth_investment"
  | "debt_cautious"
  | "collection_discipline"
  | "balanced_finance";

export type OperationalStrategy =
  | "UNKNOWN"
  | "delivery_quality_first"
  | "speed_first"
  | "process_discipline"
  | "capacity_growth"
  | "bottleneck_reduction"
  | "flexible_operations";

export type StrategicConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type StrategicConfidence = {
  level: StrategicConfidenceLevel;
  score: number;
  reason: string;
};

export type StrategicProfileEvidence = {
  id: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
};

export type StrategicProfile = {
  growthStrategy: GrowthStrategy;
  riskTolerance: RiskTolerance;
  managementStyle: ManagementStyle;
  customerStrategy: CustomerStrategy;
  peopleStrategy: PeopleStrategy;
  financialStrategy: FinancialStrategy;
  operationalStrategy: OperationalStrategy;
  confidence: StrategicConfidence;
  evidence: StrategicProfileEvidence[];
  missingSignals: string[];
  summary: string;
};

export type ExecutiveVisibilityState = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveVisibilityAssessmentItem = {
  state: ExecutiveVisibilityState;
  confidence: number;
  reason: string;
};

export type ExecutiveVisibilityAssessment = {
  financeVisibility: ExecutiveVisibilityAssessmentItem;
  customerVisibility: ExecutiveVisibilityAssessmentItem;
  personnelVisibility: ExecutiveVisibilityAssessmentItem;
  operationsVisibility: ExecutiveVisibilityAssessmentItem;
  memoryVisibility: ExecutiveVisibilityAssessmentItem;
};

export type ExecutiveRecognitionAssessmentItem = {
  score: number;
  label: ExecutiveBrainRecognitionLabel;
  explanation: string;
  signalCount: number;
  missingSignals: string[];
  evidenceRefs: string[];
};

export type ExecutiveRecognitionAssessment = Record<
  ExecutiveBrainRecognitionDomain,
  ExecutiveRecognitionAssessmentItem
>;

export type ExecutiveBrainEvidence = {
  id: string;
  domain: ExecutiveBrainRecognitionDomain | "sales";
  key: string;
  value: string;
  source: string;
  confidence: number;
};

export type ExecutiveBrainRisk = {
  id: string;
  severity: ExecutiveBrainSeverity;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveBrainOpportunity = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveBrainPriority = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveBrainRecommendation = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
};

export type ExecutiveFinding = {
  id: string;
  severity: ExecutiveBrainSeverity;
  title: string;
  explanation: string;
  evidenceRefs: string[];
};

export type ExecutiveAssessment = {
  visibility: ExecutiveVisibilityAssessment;
  recognition: ExecutiveRecognitionAssessment;
  findings: ExecutiveFinding[];
  summary: string;
};

export type ExecutiveCouncilParticipant = {
  id: string;
  role: string;
  title: string;
  confidence: number;
};

export type ExecutiveCouncilFinding = {
  id: string;
  severity: ExecutiveBrainSeverity;
  title: string;
  explanation: string;
  evidenceRefs: string[];
  participantRefs: string[];
};

export type ExecutiveCouncilRisk = {
  id: string;
  severity: ExecutiveBrainSeverity;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
  participantRefs: string[];
};

export type ExecutiveCouncilOpportunity = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
  participantRefs: string[];
};

export type ExecutiveCouncilPriority = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
  participantRefs: string[];
};

export type ExecutiveCouncilRecommendation = {
  id: string;
  impact: ExecutiveBrainImpact;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
  participantRefs: string[];
};

export type ExecutiveCouncil = {
  participants: ExecutiveCouncilParticipant[];
  findings: ExecutiveCouncilFinding[];
  risks: ExecutiveCouncilRisk[];
  opportunities: ExecutiveCouncilOpportunity[];
  priorities: ExecutiveCouncilPriority[];
  recommendations: ExecutiveCouncilRecommendation[];
  confidence: number;
  executiveSummary: string;
};

export type ExecutiveDecisionCategory =
  | "FINANCE"
  | "SALES"
  | "OPERATIONS"
  | "PEOPLE"
  | "CUSTOMER"
  | "STRATEGY"
  | "EXECUTION";

export type ExecutiveDecisionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ExecutiveDecision = {
  id: string;
  title: string;
  category: ExecutiveDecisionCategory;
  priority: ExecutiveDecisionPriority;
  rationale: string;
  expectedImpact: string;
  confidence: number;
  recommendedActions: string[];
  risks: string[];
  followUpWindow: string;
  evidenceRefs: string[];
};

export type ExecutiveDecisionPackage = {
  primaryDecision: ExecutiveDecision;
  supportingDecisions: ExecutiveDecision[];
  executiveSummary: string;
  confidence: number;
};

export type AIGeneralManagerTone =
  | "CALM"
  | "CAUTIONARY"
  | "DIRECT"
  | "SUPPORTIVE";

export type AIGeneralManagerBriefSection = {
  id: string;
  title: string;
  body: string;
  bullets: string[];
};

export type AIGeneralManagerBrief = {
  title: string;
  openingMessage: string;
  primaryDecision: string;
  whyThisMatters: string;
  firstActions: string[];
  risksToWatch: string[];
  followUp: string;
  confidence: number;
  tone: AIGeneralManagerTone;
  sayThisToday?: string;
  sections: AIGeneralManagerBriefSection[];
  evidenceRefs: string[];
};

export type ExecutiveBrainShadowMetadata =
  | {
      mode: "shadow";
      generatedAt: string;
      brief: AIGeneralManagerBrief;
      decisionPackage: ExecutiveDecisionPackage;
      councilSummary: string;
      strategicProfileSummary: string;
      recognitionSummary: string;
      confidence: number;
    }
  | {
      mode: "unavailable";
      generatedAt: string;
      reason: string;
    }
  | {
      mode: "error";
      generatedAt: string;
      error: string;
    };

export type ExecutiveSimulationJudgementChecklist = {
  expectedPrimaryCategory: ExecutiveDecisionCategory;
  expectedPriorityAtLeast: ExecutiveDecisionPriority;
  mustMention: string[];
  mustAvoid: string[];
  evaluationNotes: string[];
};

export type ExecutiveSimulationJudgementEvaluation = {
  expectedCategory: boolean;
  expectedPriority: boolean;
  mustMention: string[];
  missingMentions: string[];
  avoidedTerms: string[];
  violatedAvoidTerms: string[];
  score: number;
  passed: boolean;
};

export type ExecutiveSimulationScenario = {
  id: string;
  title: string;
  description: string;
  context: ExecutiveBrainContext;
  expectedManagementPrinciple: string;
  judgementChecklist: ExecutiveSimulationJudgementChecklist;
};

export type ExecutiveSimulationResult = {
  scenario: ExecutiveSimulationScenario;
  assessment: ExecutiveAssessment;
  council: ExecutiveCouncil;
  strategicProfile: StrategicProfile;
  decisionPackage: ExecutiveDecisionPackage;
  judgementChecklist: ExecutiveSimulationJudgementChecklist;
  judgementEvaluation: ExecutiveSimulationJudgementEvaluation;
  readableSummary: string;
};

export type ExecutiveBrainSnapshot = {
  generatedAt: string;
  companyHealth: ExecutiveBrainCompanyHealth;
  recognition: ExecutiveBrainRecognition;
  assessment: ExecutiveAssessment;
  strategicProfile: StrategicProfile;
  risks: ExecutiveBrainRisk[];
  opportunities: ExecutiveBrainOpportunity[];
  priorities: ExecutiveBrainPriority[];
  recommendations: ExecutiveBrainRecommendation[];
  evidence: ExecutiveBrainEvidence[];
  confidence: number;
};

// ─── V2: Conversation-Level Executive Brain ───────────────────────────────────
// Tek bir konuşmadan GM karar yargısı üretir.
// Modül seçmez. Route önermez. CRM entity çıkarmaz. Veri erişimi planlamaz.

// Response Mode — yaklaşım kararı; route veya modül adı içermez
export type ResponseMode =
  | "direct_answer"        // Yeterli bağlam var; doğrudan cevap ver
  | "guided_action"        // Yeterli bağlam var; kullanıcıyla birlikte ilerle
  | "clarifying_question"  // Blocking gap var; önce sor
  | "proactive_insight"    // Kullanıcının görmediği bir şeyi gör ve paylaş
  | "passive_acknowledge"; // Kaydet; şimdilik harekete geçme

// Diagnosis — "Ne gerçekten oluyor?"
export type SituationType =
  | "decision_needed"    // Bir karar verilmesi gerekiyor
  | "problem_surfaced"   // Bir sorun dile getirildi
  | "information_sought" // Bilgi isteniyor
  | "action_requested"   // Somut bir eylem talep ediliyor
  | "sentiment_shared"   // Duygu ya da durum paylaşımı
  | "unclear";

export type DiagnosisResult = {
  coreIssue: string;
  hiddenRisk: string | null;
  situationType: SituationType;
};

// Decision Frame — "Hangi soruyu gerçekte cevaplıyorum?"
export type DecisionFrame = {
  actualQuestion: string;
  options: string[];
  constraints: string[];
};

// Risk Profile — "Hareket edersem / etmezsem ne olur?"
export type Reversibility = "reversible" | "hard_to_reverse" | "irreversible" | "unknown";

export type RiskProfile = {
  immediateRisk: string | null;
  downstreamRisk: string | null;
  reversibility: Reversibility;
};

// Response Strategy — "Nasıl yaklaşacağım?"
export type ResponseTone =
  | "direct"
  | "supportive"
  | "cautious"
  | "curious";

export type ResponseStrategy = {
  responseMode: ResponseMode;
  tone: ResponseTone;
  nextStep: string;
  clarificationNeeded: boolean;
  clarificationQuestion: string | null;
};

// Brain I/O
export type ExecutiveBrainV2Input = {
  message: string;
  context: ExecutiveContextV2;
};

export type ExecutiveBrainV2Output = {
  diagnosis: DiagnosisResult;
  decisionFrame: DecisionFrame;
  riskProfile: RiskProfile;
  responseStrategy: ResponseStrategy;
};
