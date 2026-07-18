import type { MemoryItemSource, MemoryItemType } from "@prisma/client";

declare const authorityDecisionBrand: unique symbol;
declare const authorityProjectionBrand: unique symbol;

export type KnowledgeProducer =
  | "USER_STATEMENT"
  | "USER_CORRECTION"
  | "EOS_LEARNING"
  | "EXECUTIVE_REASONING"
  | "EXECUTIVE_RECOMMENDATION"
  | "EXECUTIVE_OPINION"
  | "SYSTEM_EVENT"
  | "RECOGNITION_RESULT"
  | "DECISION_OUTCOME"
  | "CONVERSATION_STATE"
  | "MIND_STATE"
  | "EXISTING_MEMORY"
  | "COMPANY_MODEL"
  | "METADATA_REUSE"
  | "ONBOARDING"
  | "CANDIDATE_APPROVED"
  | (string & {});

export type EpistemicType =
  | "FACT"
  | "PREFERENCE"
  | "PROCESS"
  | "STRATEGIC"
  | "HYPOTHESIS"
  | "BELIEF"
  | "OPINION"
  | "SIGNAL"
  | "EVENT"
  | "DECISION"
  | "ASSUMPTION"
  | "INFERENCE"
  | "UNKNOWN";

export type TruthBoundary =
  | "VERIFIED"
  | "USER_CONFIRMED"
  | "AUTHORITY_CONFIRMED"
  | "SYSTEM_DERIVED"
  | "MODEL_INFERRED"
  | "EXECUTIVE_OPINION"
  | "CONVERSATION_ONLY"
  | "TEMPORARY"
  | "DISCARD";

export type CanonicalKnowledgeOwner =
  | "CONVERSATION_STATE"
  | "MIND_STATE"
  | "MEMORY_CANDIDATE"
  | "MEMORY_ITEM"
  | "DECISION_RECORD"
  | "COMPANY_OPINION"
  | "DISCARD";

export type KnowledgeProjectionTarget =
  | "CONVERSATION_CONTINUITY"
  | "MIND_STATE"
  | "COMPANY_MODEL"
  | "EXECUTIVE_CONTEXT"
  | "PROMPT"
  | "GATEWAY"
  | "EXECUTIVE_REASONING";

export type KnowledgePromotionPolicy = "NONE" | "AUTOMATIC" | "HUMAN_APPROVAL";

export type KnowledgeSignal = {
  producer: KnowledgeProducer;
  key: string;
  value: string;
  memoryItemType?: MemoryItemType;
  memorySource?: MemoryItemSource;
  epistemicType?: EpistemicType;
  verified?: boolean;
  userConfirmed?: boolean;
  isAssumption?: boolean;
  conversationScoped?: boolean;
  durable?: boolean;
  requiresHumanApproval?: boolean;
  candidatePersistence?: boolean;
  confidence?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CompanyOpinion = {
  key: string;
  value: string;
  epistemicType: "OPINION" | "HYPOTHESIS" | "BELIEF" | "INFERENCE";
  truthBoundary: "EXECUTIVE_OPINION" | "MODEL_INFERRED";
  confidence: number | null;
  sourceProducer: KnowledgeProducer;
  promotableToMemory: false;
};

export type KnowledgeProjection = {
  readonly [authorityProjectionBrand]: true;
  owner: CanonicalKnowledgeOwner;
  target: KnowledgeProjectionTarget;
  key: string;
  value: string;
  epistemicType: EpistemicType;
  truthBoundary: TruthBoundary;
  readOnly: true;
};

export type KnowledgeAuthorityDecision = {
  readonly [authorityDecisionBrand]: true;
  version: "v1";
  signal: KnowledgeSignal;
  epistemicType: EpistemicType;
  truthBoundary: TruthBoundary;
  canonicalOwner: CanonicalKnowledgeOwner;
  promotionPolicy: KnowledgePromotionPolicy;
  projections: KnowledgeProjection[];
  companyOpinion: CompanyOpinion | null;
  reason: string;
};
