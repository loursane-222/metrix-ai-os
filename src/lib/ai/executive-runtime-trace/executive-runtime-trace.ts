import { createHash } from "crypto";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveAssessmentV1 } from "@/lib/executive-assessment";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";
import type { ExecutiveBehaviorPlanV1 } from "@/lib/ai/living-executive-presence";
import type {
  ExecutiveRuntimeTraceChannelV1,
  ExecutiveRuntimeTraceLatencyV1,
  ExecutiveRuntimeTraceLoggerV1,
  ExecutiveRuntimeTraceV1,
} from "./contracts";

const EVENT_NAME = "executive_runtime_trace_v1" as const;
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,96}$/u;
const MAX_CODES = 24;

type TraceIdentity = Readonly<{
  requestId: string;
  correlationId: string;
  turnId?: string;
  conversationId: string;
  organizationId: string;
  channel: ExecutiveRuntimeTraceChannelV1;
  createdAt?: string;
}>;

type MutableLatency = {
  -readonly [K in keyof Omit<ExecutiveRuntimeTraceLatencyV1, "totalMs">]: number | null;
};

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function safeCodes(values: readonly string[]): readonly string[] {
  return Object.freeze(values.slice(0, MAX_CODES).map((value) =>
    SAFE_CODE.test(value) ? value : hashText(value)
  ));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function defaultLogger(
  event: ExecutiveRuntimeTraceV1["event"],
  trace: ExecutiveRuntimeTraceV1,
): void {
  console.info({ ...trace, event });
}

export class ExecutiveRuntimeTraceCollectorV1 {
  private readonly startedAt = performance.now();
  private readonly identity: Required<Omit<TraceIdentity, "turnId" | "createdAt">>
    & Pick<TraceIdentity, "turnId" | "createdAt">;
  private readonly logger: ExecutiveRuntimeTraceLoggerV1;
  private readonly latency: MutableLatency = {
    conversationUnderstandingMs: null,
    managementPictureMs: null,
    assessmentMs: null,
    directiveMs: null,
    behaviorPlanMs: null,
    conversationGuidanceMs: null,
    canonicalPromptMs: null,
    responseMs: null,
  };
  private understanding?: ExecutiveRuntimeTraceV1["conversationUnderstandingSummary"];
  private picture?: ExecutiveRuntimeTraceV1["managementPictureSummary"];
  private assessment?: ExecutiveRuntimeTraceV1["assessmentSummary"];
  private directive?: ExecutiveRuntimeTraceV1["directiveSummary"];
  private behavior?: ExecutiveRuntimeTraceV1["behaviorPlanSummary"];
  private guidance?: ExecutiveRuntimeTraceV1["conversationGuidanceSummary"];
  private prompt?: ExecutiveRuntimeTraceV1["canonicalPromptSummary"];
  private finalized?: ExecutiveRuntimeTraceV1;

  constructor(
    identity: TraceIdentity,
    logger: ExecutiveRuntimeTraceLoggerV1 = defaultLogger,
  ) {
    this.identity = identity;
    this.logger = logger;
  }

  observeConversationUnderstanding(
    understanding: ConversationUnderstanding,
    latencyMs: number,
  ): void {
    if (this.understanding) return;
    this.understanding = {
      conversationKind: understanding.conversationKind,
      userMotivation: understanding.userMotivation,
      companyRelevance: understanding.companyRelevance,
      actionExpectation: understanding.actionExpectation,
      confidence: understanding.confidence,
      shouldAskClarification: understanding.shouldAskClarification,
      shouldInvokeExecutiveBrain: understanding.shouldInvokeExecutiveBrain,
      suggestedHandling: understanding.suggestedHandling,
    };
    this.latency.conversationUnderstandingMs = Math.round(latencyMs);
  }

  observeManagementPicture(
    picture: ExecutiveManagementPictureV1,
    latencyMs: number,
  ): void {
    if (this.picture) return;
    this.picture = {
      assessmentReady: picture.readiness.assessmentReady,
      signalCountsByDomain: {
        ownerSignals: picture.managementReality.ownerSignals.length,
        companySignals: picture.managementReality.companySignals.length,
        customerSignals: picture.managementReality.customerSignals.length,
        personnelSignals: picture.managementReality.personnelSignals.length,
        salesSignals: picture.managementReality.salesSignals.length,
        financeSignals: picture.managementReality.financeSignals.length,
        operationsSignals: picture.managementReality.operationsSignals.length,
        memorySignals: picture.managementReality.memorySignals.length,
      },
      evidenceGapCodes: safeCodes(picture.evidence.evidenceGaps),
      confidence: picture.confidence.overall,
      sourceAvailability: Object.freeze(
        picture.evidence.sourceReliability.map((source) => Object.freeze({
          source: SAFE_CODE.test(source.source) ? source.source : hashText(source.source),
          connected: source.connected,
          reliability: source.reliability,
          signalCount: source.signalCount,
        })),
      ),
    };
    this.latency.managementPictureMs = Math.round(latencyMs);
  }

  observeAssessment(assessment: ExecutiveAssessmentV1, latencyMs: number): void {
    if (this.assessment) return;
    this.assessment = {
      status: assessment.status,
      confidence: assessment.confidence,
      findingCount: assessment.findings.length,
      riskCount: assessment.risks.length,
      opportunityCount: assessment.opportunities.length,
      evidenceGapCount: assessment.evidenceGaps.length,
      findingCodes: safeCodes(assessment.findings.map((finding) => finding.id)),
    };
    this.latency.assessmentMs = Math.round(latencyMs);
  }

  observeDirective(directive: ExecutiveDirectiveV1, latencyMs: number): void {
    if (this.directive) return;
    this.directive = {
      authorityMode: directive.authorityMode,
      primaryIntent: directive.primaryIntent,
      actionStrategy: directive.actionStrategy,
      reasoningMode: directive.reasoningMode,
    };
    this.latency.directiveMs = Math.round(latencyMs);
  }

  observeBehaviorPlan(plan: ExecutiveBehaviorPlanV1, latencyMs: number): void {
    if (this.behavior) return;
    this.behavior = {
      primaryBehavior: plan.primaryBehavior,
      questionPolicy: plan.questionPolicy,
      challengePolicy: plan.challengePolicy,
    };
    this.latency.behaviorPlanMs = Math.round(latencyMs);
  }

  observeConversationGuidance(guidance: string | null, latencyMs: number): void {
    if (this.guidance) return;
    this.guidance = {
      present: guidance !== null,
      guidanceHash: guidance === null ? null : hashText(guidance),
      guidanceLength: guidance?.length ?? 0,
    };
    this.latency.conversationGuidanceMs = Math.round(latencyMs);
  }

  observeCanonicalPrompt(prompt: string, latencyMs: number): void {
    if (this.prompt) return;
    this.prompt = {
      canonicalAuthoritySectionPresent: prompt.includes("CANONICAL EXECUTIVE AUTHORITY:"),
      managementPictureSectionPresent: prompt.includes("KANITLANMIS YONETIM GERCEKLIGI:"),
      assessmentFindingsCount: countCanonicalFindings(prompt),
      noEvidenceInstructionPresent: prompt.includes(
        "ready=false veya finding yoksa yonetim kanaati verme",
      ),
      legacyAuthoritySectionPresent: [
        "ExecutiveManagerContext",
        "EXECUTIVE MANAGER CONTEXT",
        "Arka plan yonetici sezgisi:",
        "Finansal sağlık seviyesi:",
      ].some((marker) => prompt.includes(marker)),
      promptHash: hashText(prompt),
    };
    this.latency.canonicalPromptMs = Math.round(latencyMs);
  }

  finalizeResponse(response: string, latencyMs: number): ExecutiveRuntimeTraceV1 {
    if (this.finalized) return this.finalized;
    const trace = deepFreeze({
      schemaVersion: "executive-runtime-trace.v1",
      event: EVENT_NAME,
      requestId: this.identity.requestId,
      correlationId: this.identity.correlationId,
      turnId: this.identity.turnId ?? null,
      conversationId: this.identity.conversationId,
      organizationId: this.identity.organizationId,
      channel: this.identity.channel,
      createdAt: this.identity.createdAt ?? new Date().toISOString(),
      conversationUnderstandingSummary: requireStage(this.understanding, "understanding"),
      managementPictureSummary: requireStage(this.picture, "management picture"),
      assessmentSummary: requireStage(this.assessment, "assessment"),
      directiveSummary: requireStage(this.directive, "directive"),
      behaviorPlanSummary: requireStage(this.behavior, "behavior plan"),
      conversationGuidanceSummary: requireStage(this.guidance, "conversation guidance"),
      canonicalPromptSummary: requireStage(this.prompt, "canonical prompt"),
      responseSummary: {
        responseHash: hashText(response),
        responseLength: response.length,
        recommendationLikeClaimDetected:
          /(önceli[kğ]|oner|öner|tavsiye|yapmalı|yapmalısın|doğru hamle)/iu.test(response),
        clarificationLikeResponseDetected:
          response.includes("?")
          || /(eksik bilgi|netleştir|netlestir|hangi bilgi|bilgiye ihtiyac)/iu.test(response),
      },
      latency: {
        ...this.latency,
        responseMs: Math.round(latencyMs),
        totalMs: Math.round(performance.now() - this.startedAt),
      },
    } satisfies ExecutiveRuntimeTraceV1);
    this.finalized = trace;
    this.logger(EVENT_NAME, trace);
    return trace;
  }
}

function requireStage<T>(stage: T | undefined, name: string): T {
  if (stage === undefined) {
    throw new Error(`Executive runtime trace stage missing: ${name}`);
  }
  return stage;
}

function countCanonicalFindings(prompt: string): number {
  const section = prompt.split("CANONICAL ASSESSMENT FINDINGS:")[1]
    ?.split("EKSIK YONETIM KANITLARI:")[0];
  if (!section) return 0;
  return section
    .split("\n")
    .filter((line) =>
      line.startsWith("- ")
      && line !== "- Kanita dayali yonetim yorumu yok."
    ).length;
}

export function createExecutiveRuntimeTraceV1(
  identity: TraceIdentity,
  logger?: ExecutiveRuntimeTraceLoggerV1,
): ExecutiveRuntimeTraceCollectorV1 {
  return new ExecutiveRuntimeTraceCollectorV1(identity, logger);
}
