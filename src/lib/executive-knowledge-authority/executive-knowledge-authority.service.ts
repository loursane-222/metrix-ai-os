import type {
  CanonicalKnowledgeOwner,
  CompanyOpinion,
  EpistemicType,
  KnowledgeAuthorityDecision,
  KnowledgeProjectionTarget,
  KnowledgePromotionPolicy,
  KnowledgeSignal,
  TruthBoundary,
} from "./executive-knowledge-authority.types";
import type { Prisma } from "@prisma/client";

const OPINION_PRODUCERS = new Set([
  "EXECUTIVE_REASONING",
  "EXECUTIVE_RECOMMENDATION",
  "EXECUTIVE_OPINION",
]);

const NEVER_AUTOMATIC_MEMORY = new Set<EpistemicType>([
  "HYPOTHESIS",
  "BELIEF",
  "OPINION",
  "ASSUMPTION",
  "INFERENCE",
  "SIGNAL",
  "UNKNOWN",
]);

export function evaluateKnowledgeSignal(
  signal: KnowledgeSignal,
): KnowledgeAuthorityDecision {
  const normalized = normalizeSignal(signal);
  const epistemicType = classifyEpistemicType(normalized);
  const truthBoundary = classifyTruthBoundary(normalized, epistemicType);
  const canonicalOwner = selectCanonicalOwner(normalized, epistemicType, truthBoundary);
  const promotionPolicy = selectPromotionPolicy(
    normalized,
    epistemicType,
    truthBoundary,
    canonicalOwner,
  );
  const targets = selectProjectionTargets(canonicalOwner);

  return {
    version: "v1",
    signal: normalized,
    epistemicType,
    truthBoundary,
    canonicalOwner,
    promotionPolicy,
    projections: targets.map((target) => ({
      owner: canonicalOwner,
      target,
      key: normalized.key,
      value: normalized.value,
      epistemicType,
      truthBoundary,
      readOnly: true,
    })) as KnowledgeAuthorityDecision["projections"],
    companyOpinion: buildCompanyOpinion(normalized, epistemicType, truthBoundary, canonicalOwner),
    reason: buildReason(canonicalOwner, truthBoundary, promotionPolicy),
  } as KnowledgeAuthorityDecision;
}

export function buildKnowledgeAuthorityMetadata(
  decision: KnowledgeAuthorityDecision,
): Prisma.InputJsonObject {
  return {
    knowledgeAuthority: {
      version: decision.version,
      producer: decision.signal.producer,
      epistemicType: decision.epistemicType,
      truthBoundary: decision.truthBoundary,
      canonicalOwner: decision.canonicalOwner,
      promotionPolicy: decision.promotionPolicy,
      projectionTargets: decision.projections.map((projection) => projection.target),
    },
  };
}

function normalizeSignal(signal: KnowledgeSignal): KnowledgeSignal {
  return { ...signal, key: signal.key.trim(), value: signal.value.trim() };
}

function classifyEpistemicType(signal: KnowledgeSignal): EpistemicType {
  if (signal.epistemicType) return signal.epistemicType;
  if (signal.isAssumption) return "ASSUMPTION";
  if (signal.producer === "DECISION_OUTCOME") return "DECISION";
  if (signal.producer === "SYSTEM_EVENT") return "EVENT";
  if (signal.producer === "RECOGNITION_RESULT") return "INFERENCE";
  if (signal.producer === "EOS_LEARNING") return "SIGNAL";
  if (OPINION_PRODUCERS.has(signal.producer)) return "OPINION";
  if (signal.memoryItemType) return signal.memoryItemType;
  return "UNKNOWN";
}

function classifyTruthBoundary(
  signal: KnowledgeSignal,
  epistemicType: EpistemicType,
): TruthBoundary {
  if (!signal.key || !signal.value) return "DISCARD";
  if (signal.producer === "EXISTING_MEMORY") return "AUTHORITY_CONFIRMED";
  if (signal.producer === "CANDIDATE_APPROVED") return "USER_CONFIRMED";
  if (signal.producer === "DECISION_OUTCOME" && signal.verified !== false) return "VERIFIED";
  if (signal.userConfirmed || signal.producer === "USER_CORRECTION") return "USER_CONFIRMED";
  if (signal.producer === "ONBOARDING") return "USER_CONFIRMED";
  if (OPINION_PRODUCERS.has(signal.producer)) return "EXECUTIVE_OPINION";
  if (signal.producer === "MIND_STATE" || signal.producer === "CONVERSATION_STATE") {
    return "CONVERSATION_ONLY";
  }
  if (signal.verified) return "VERIFIED";
  if (signal.producer === "SYSTEM_EVENT") return "SYSTEM_DERIVED";
  if (epistemicType === "INFERENCE" || signal.producer === "RECOGNITION_RESULT") {
    return "MODEL_INFERRED";
  }
  if (signal.producer === "USER_STATEMENT") return "USER_CONFIRMED";
  return signal.conversationScoped ? "TEMPORARY" : "MODEL_INFERRED";
}

function selectCanonicalOwner(
  signal: KnowledgeSignal,
  epistemicType: EpistemicType,
  truth: TruthBoundary,
): CanonicalKnowledgeOwner {
  if (truth === "DISCARD") return "DISCARD";
  if (signal.producer === "EXISTING_MEMORY") return "MEMORY_ITEM";
  if (signal.producer === "DECISION_OUTCOME") return "DECISION_RECORD";
  if (epistemicType === "DECISION") return "DECISION_RECORD";
  if (OPINION_PRODUCERS.has(signal.producer)) return "COMPANY_OPINION";
  if (signal.candidatePersistence) return "MEMORY_CANDIDATE";
  if (signal.requiresHumanApproval) return "MEMORY_CANDIDATE";
  if (signal.producer === "MIND_STATE") return "CONVERSATION_STATE";
  if (signal.producer === "CONVERSATION_STATE" || signal.conversationScoped) {
    return "CONVERSATION_STATE";
  }
  if (signal.producer === "EOS_LEARNING" || signal.producer === "RECOGNITION_RESULT") {
    return signal.durable === false ? "DISCARD" : "MEMORY_CANDIDATE";
  }
  if (NEVER_AUTOMATIC_MEMORY.has(epistemicType)) return "MEMORY_CANDIDATE";
  if (truth === "VERIFIED" || truth === "USER_CONFIRMED") return "MEMORY_ITEM";
  return "MEMORY_CANDIDATE";
}

function selectPromotionPolicy(
  signal: KnowledgeSignal,
  epistemicType: EpistemicType,
  truth: TruthBoundary,
  owner: CanonicalKnowledgeOwner,
): KnowledgePromotionPolicy {
  if (owner === "MEMORY_CANDIDATE") {
    return signal.candidatePersistence && !signal.requiresHumanApproval
      ? "AUTOMATIC"
      : "HUMAN_APPROVAL";
  }
  if (owner !== "MEMORY_ITEM") return "NONE";
  if (NEVER_AUTOMATIC_MEMORY.has(epistemicType)) return "NONE";
  if (signal.producer === "SYSTEM_EVENT" && !signal.verified) return "HUMAN_APPROVAL";
  return truth === "VERIFIED" || truth === "USER_CONFIRMED" ? "AUTOMATIC" : "NONE";
}

function selectProjectionTargets(owner: CanonicalKnowledgeOwner): KnowledgeProjectionTarget[] {
  switch (owner) {
    case "MEMORY_ITEM":
      return ["COMPANY_MODEL", "EXECUTIVE_CONTEXT", "PROMPT", "GATEWAY", "EXECUTIVE_REASONING"];
    case "DECISION_RECORD":
      return ["MIND_STATE", "CONVERSATION_CONTINUITY", "EXECUTIVE_CONTEXT", "EXECUTIVE_REASONING"];
    case "COMPANY_OPINION":
      return ["COMPANY_MODEL", "EXECUTIVE_CONTEXT", "EXECUTIVE_REASONING"];
    case "CONVERSATION_STATE":
    case "MIND_STATE":
      return ["MIND_STATE", "CONVERSATION_CONTINUITY", "PROMPT"];
    default:
      return [];
  }
}

function buildCompanyOpinion(
  signal: KnowledgeSignal,
  epistemicType: EpistemicType,
  truth: TruthBoundary,
  owner: CanonicalKnowledgeOwner,
): CompanyOpinion | null {
  if (owner !== "COMPANY_OPINION") return null;
  const opinionType = epistemicType === "HYPOTHESIS" || epistemicType === "BELIEF" || epistemicType === "INFERENCE"
    ? epistemicType
    : "OPINION";
  return {
    key: signal.key,
    value: signal.value,
    epistemicType: opinionType,
    truthBoundary: truth === "MODEL_INFERRED" ? "MODEL_INFERRED" : "EXECUTIVE_OPINION",
    confidence: signal.confidence ?? null,
    sourceProducer: signal.producer,
    promotableToMemory: false,
  };
}

function buildReason(
  owner: CanonicalKnowledgeOwner,
  truth: TruthBoundary,
  promotion: KnowledgePromotionPolicy,
): string {
  return `Canonical owner ${owner}; truth boundary ${truth}; promotion ${promotion}.`;
}
