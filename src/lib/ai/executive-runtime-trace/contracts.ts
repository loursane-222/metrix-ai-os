import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveAssessmentV1 } from "@/lib/executive-assessment";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";
import type { ExecutiveBehaviorPlanV1 } from "@/lib/ai/living-executive-presence";

export type ExecutiveRuntimeTraceChannelV1 = "text" | "voice";

export type ExecutiveRuntimeTraceLatencyV1 = Readonly<{
  conversationUnderstandingMs: number | null;
  managementPictureMs: number | null;
  assessmentMs: number | null;
  directiveMs: number | null;
  behaviorPlanMs: number | null;
  conversationGuidanceMs: number | null;
  canonicalPromptMs: number | null;
  responseMs: number | null;
  totalMs: number;
}>;

export type ExecutiveRuntimeTraceV1 = Readonly<{
  schemaVersion: "executive-runtime-trace.v1";
  event: "executive_runtime_trace_v1";
  requestId: string;
  correlationId: string;
  turnId: string | null;
  conversationId: string;
  organizationId: string;
  channel: ExecutiveRuntimeTraceChannelV1;
  createdAt: string;
  conversationUnderstandingSummary: Readonly<Pick<
    ConversationUnderstanding,
    | "conversationKind"
    | "userMotivation"
    | "companyRelevance"
    | "actionExpectation"
    | "confidence"
    | "shouldAskClarification"
    | "shouldInvokeExecutiveBrain"
    | "suggestedHandling"
  >>;
  managementPictureSummary: Readonly<{
    assessmentReady: boolean;
    signalCountsByDomain: Readonly<Record<
      keyof ExecutiveManagementPictureV1["managementReality"],
      number
    >>;
    evidenceGapCodes: readonly string[];
    confidence: number;
    sourceAvailability: readonly Readonly<{
      source: string;
      connected: boolean;
      reliability: string;
      signalCount: number;
    }>[];
  }>;
  assessmentSummary: Readonly<{
    status: ExecutiveAssessmentV1["status"];
    confidence: ExecutiveAssessmentV1["confidence"];
    findingCount: number;
    riskCount: number;
    opportunityCount: number;
    evidenceGapCount: number;
    findingCodes: readonly string[];
  }>;
  directiveSummary: Readonly<Pick<
    ExecutiveDirectiveV1,
    "authorityMode" | "primaryIntent" | "actionStrategy" | "reasoningMode"
  >>;
  behaviorPlanSummary: Readonly<Pick<
    ExecutiveBehaviorPlanV1,
    "primaryBehavior" | "questionPolicy" | "challengePolicy"
  >>;
  conversationGuidanceSummary: Readonly<{
    present: boolean;
    guidanceHash: string | null;
    guidanceLength: number;
  }>;
  canonicalPromptSummary: Readonly<{
    canonicalAuthoritySectionPresent: boolean;
    managementPictureSectionPresent: boolean;
    assessmentFindingsCount: number;
    noEvidenceInstructionPresent: boolean;
    legacyAuthoritySectionPresent: boolean;
    promptHash: string;
  }>;
  responseSummary: Readonly<{
    responseHash: string;
    responseLength: number;
    recommendationLikeClaimDetected: boolean;
    clarificationLikeResponseDetected: boolean;
  }>;
  latency: ExecutiveRuntimeTraceLatencyV1;
}>;

export type ExecutiveRuntimeTraceLoggerV1 = (
  event: ExecutiveRuntimeTraceV1["event"],
  trace: ExecutiveRuntimeTraceV1,
) => void;
