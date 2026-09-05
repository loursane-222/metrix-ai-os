import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { streamWithAiGateway } from "@/lib/ai/gateway/ai-gateway";
import type { AiGatewayStreamHandle } from "@/lib/ai/gateway/ai-gateway";
import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
import { createOpenAiStream } from "@/lib/ai/providers/openai-provider";
import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import { fail } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalString,
  optionalStringEnum,
  readJsonObject,
  requiredString,
  type RequestBody,
} from "@/lib/api/validation";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import {
  resolveChatConversation,
  sendAiMessage,
  sendUserMessage,
} from "@/lib/application/conversations/conversation.service";
import {
  findLastAiMessageByConversation,
  listRecentMessagesByConversation,
} from "@/lib/core/conversations/conversation.repository";
import type { ConversationHistoryTurn } from "@/lib/ai/providers/ai-provider";
import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";
import {
  buildExecutiveAssessmentFromManagementPicture,
  type ExecutiveAssessmentV1,
} from "@/lib/executive-assessment";
import {
  buildExecutiveManagementPictureV1,
  type ExecutiveManagementPictureV1,
} from "@/lib/executive-management-picture";

import { buildExecutiveConstitutionContext } from "@/lib/executive-constitution/executive-constitution-context-builder.service";
import { resolveExecutiveCouncilActivation } from "@/lib/executive-constitution/executive-council-activation.service";
import { buildLearningLoop } from "@/lib/learning-loop/learning-loop-orchestrator.service";
import { buildManagerAdviceAugmentationContext } from "@/lib/manager-advice/manager-advice-augmentation.service";
import { buildManagerAdviceBrief } from "@/lib/manager-advice/manager-advice-brief-builder.service";
import { composeManagerAdviceResponse } from "@/lib/manager-advice/manager-advice-composer.service";
import { analyzeManagerAdvice } from "@/lib/manager-advice/manager-advice-orchestrator.service";
import { buildManagerAdviceResponseDraft } from "@/lib/manager-advice/manager-advice-response-builder.service";
import {
  createDeterministicUpdateCandidates,
  createMissingMemoryCandidates,
} from "@/lib/memory/candidate-engine.service";
import { detectExecutiveKnowledge } from "@/lib/knowledge/executive-knowledge-acquisition-engine.service";
import { mapKnowledgeDetectionsToMemoryCandidates } from "@/lib/knowledge/executive-knowledge-candidate-mapper.service";
import { detectKnowledgeGaps } from "@/lib/knowledge/executive-knowledge-gap-engine.service";
import { buildExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import type { ExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import { buildOrganizationSummary } from "@/lib/core/organizations/organization-summary";
import { buildBusinessOverview } from "@/lib/company/business-overview-synthesis.service";
import {
  registerExecutiveDecisionCommitment,
  registerAndResolveExecutiveDecisionOutcome,
} from "@/lib/executive-decision-loop";
import {
  projectExecutiveOutcomeToMemory,
  type ExecutiveOutcomeV1,
} from "@/lib/executive-outcome";

import { BusinessCandidateSourceChannel, MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";
import type { MemoryCandidate, Organization, Prisma } from "@prisma/client";
import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type { GenerateAiResponseResult } from "@/lib/ai/ai.types";
import { sanitizeExecutiveManagerResponse } from "@/lib/ai/executive-presence-layer";
import { buildExecutiveFallbackResponse, buildExecutiveIdentityPrompt, buildExecutivePresenceSurfacePolicy } from "@/lib/ai/identity/executive-identity-prompt";
import {
  buildLivingRepairGuidance,
  projectLivingBehaviorPrompt,
  resolveLivingExecutiveBehavior,
  type LivingBehaviorViolation,
  adaptExecutiveDirectiveToExecutiveBehaviorPlan,
  adaptExecutiveBehaviorPlanToLivingHint,
  type ExecutiveBehaviorPlanV1,
  type LivingExecutiveSemanticHint,
} from "@/lib/ai/living-executive-presence";
import {
  resolveExecutiveDirective,
  type ExecutiveDecisionCalibrationV1,
  type ExecutiveDirectiveV1,
} from "@/lib/ai/executive-directive";
import {
  createExecutiveRuntimeTraceV1,
} from "@/lib/ai/executive-runtime-trace";
import {
  appendExecutiveRuntimeCandidateTrace,
  persistExecutiveRuntimeTraceDeferred,
} from "@/lib/ai/executive-runtime-trace/executive-runtime-trace-persistence.service";
import {
  detectExecutiveGap,
} from "@/lib/manager-advice/executive-gap-detector.service";
import type {
  ExecutiveBrainShadowMetadata,
} from "@/lib/executive-brain/executive-brain.types";
import type {
  ExecutiveConstitutionContext,
  ExecutiveCouncilActivation,
} from "@/lib/executive-constitution/executive-constitution.types";
import type { ManagerAdviceAugmentationContext } from "@/lib/manager-advice/manager-advice-augmentation.types";
import { isNewCommitment, isNewOutcome } from "@/lib/executive-conversation/executive-commitment-engine.service";
import type { ChatExecutiveCognitionObservation } from "@/lib/ai/chat-executive-intelligence.adapter";
import { runExecutiveAgent, type ExecutiveAgentRunContext, type ExecutiveAgentRunResult } from "@/lib/executive-agent";
import {
  classifyConversation,
  buildManagementIntentUnderstanding,
  recognizeManagementIntent,
  buildCompanySurfaceNavigationUnderstanding,
  recognizeCompanySurfaceNavigation,
  resolveConversationRuntime,
  resolveTextResponseReadiness,
  tryFastPathClassification,
  type ConversationUnderstanding,
} from "@/lib/conversation-understanding";
import {
  buildCompanyQueryResponse,
  type CompanyQueryResult,
} from "@/lib/company-query-authority";
import { executeCanonicalOperation } from "@/lib/canonical-operation";
import {
  buildCollectionComparisonPromptLine,
  buildCollectionComparisonResponse,
  buildCollectionDriversPromptLine,
  buildCollectionDriversResponse,
  buildCollectionPerformancePromptLine,
  buildCollectionPerformanceResponse,
  buildCollectionTargetPromptLine,
  buildCollectionTargetResponse,
  projectCollectionComparisonTurnFact,
  projectCollectionDriversTurnFact,
  projectCollectionPerformanceTurnFact,
  projectCollectionTargetTurnFact,
} from "@/lib/domain-evidence";
import {
  buildExternalEvidencePromptLine,
  resolveLiveExternalEvidence,
} from "@/lib/ai/external-evidence/conversation-research-tool";
import { detectGoogleEvidenceNeed } from "@/lib/company-intelligence/google-evidence-need";
import { buildGoogleEvidencePromptLine, resolveGoogleEvidence } from "@/lib/company-intelligence/google-evidence";
import { buildCurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import { buildCurrentReceivableResponse, projectCurrentReceivableTurnFact } from "@/lib/core/reporting/current-receivable-turn";
import { buildCashFlowDataset, buildCashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import { buildCurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import { buildCashPayablesResponse, type CashPayablesTurnFact } from "@/lib/core/reporting/cash-payables-turn";
import { buildFinancialAttentionResponse, evaluateFinancialAttention } from "@/lib/financial-attention/financial-attention.policy";
import { buildFinancialManagementSynthesis, buildFinancialManagementSynthesisResponse } from "@/lib/financial-overview/financial-management-synthesis";
import { buildConfirmedOrderFlowDataset, buildConfirmedOrderFlowResponse, buildCurrentOrderBacklogDataset, buildCurrentOrderBacklogResponse, buildCurrentQuotePipelineDataset, buildCurrentQuotePipelinePromptLine, buildCurrentQuotePipelineResponse, buildQuoteActivityDataset, buildQuoteActivityPromptLine, buildQuoteActivityResponse, buildQuoteSentCohortDataset, buildQuoteSentCohortResponse } from "@/lib/sales-intelligence";
import { buildCompanyManagementAttentionResponse, buildCompanyManagementResponse, buildCustomerManagementDataset, buildCustomerManagementResponse, buildCurrentOrderOperationsDataset, buildInvoicedActivityDataset, buildInvoicedActivityResponse, buildManagementIntelligencePromptLine, buildOperationsManagementDataset, buildOperationsManagementResponse, buildOrderOperationsResponse, buildPostedSalesResponse } from "@/lib/management-intelligence";
import { createRequestProfiler, type RequestProfiler } from "@/lib/ai/performance/request-profiler";
import {
  buildCalendarNavigationMessage,
  buildListableDomainSnapshotFetcher,
  createCalendarClock,
  LISTABLE_DOMAIN_LABELS,
  projectBusinessNavigation,
  projectBusinessNavigationOperationEvidence,
  resolveBusinessNavigation,
  resolveOperationContinuationNavigation,
  sampleRecordNamesForNarration,
  type BusinessNavigationOperationEvidence,
  type CalendarClock,
} from "@/lib/executive-request-resolution";
import { resolveExecutivePause } from "@/lib/executive-signatures/executive-pause";
import { prisma } from "@/lib/core/shared/prisma";
import { buildMemoryContextFromItems } from "@/lib/memory/memory-context-builder.service";
import { USER_MESSAGE_CREATED } from "@/lib/core/events/event-names";
import { randomUUID } from "crypto";
import { captureActivationMetadata, captureLiveCustomerConversation } from "@/lib/customers/customer-live-capture.service";
import {
  extractAndPersistBusinessCandidates,
  generateBusinessRealityExtractionText,
} from "@/lib/business-reality-candidates";
import { validateConversationExtensionHandoff, isNavigationBlindHandoff, isProvisionalConversationHandoff, type ConversationExtensionHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";
import { validateActiveWorkspaceContext } from "@/lib/living-workspace/contracts";
import { buildUniversalHandoffMessage, buildUnconfirmedMutationIntentMessage } from "@/lib/conversation-extensions/conversation-extension-handoff-message";
import { CUSTOMER_BUILT_IN_FIELDS } from "@/lib/customers/customer-field-registry";
import { emitCustomerLifecycle } from "@/lib/conversation-extensions/conversation-lifecycle-telemetry";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "@/lib/conversation-extensions/business-navigation-telemetry";
import { canonicalFactsFromConversationArtifacts, detectCanonicalBusinessFactEntities, isCanonicalBusinessFactListRequest, readCanonicalBusinessFactsForMessage, serializeCanonicalBusinessFacts } from "@/lib/canonical-business-facts/canonical-business-facts.service";
import { buildConversationTurnArtifacts, readConversationTurnArtifacts } from "@/lib/conversations/conversation-turn-artifact";
import { buildLastSuccessfulOperationContext, readLastSuccessfulOperationContext } from "@/lib/conversations/last-operation-context";
import { isBareRevealFollowUp } from "@/lib/conversation-extensions/reveal-intent";
import { completeFirstExperienceAfterNormalTurn } from "@/lib/first-experience/first-experience.service";
import {
  buildTechnicalRepairUnavailableMessage,
  extractConversationState,
  logChatLatency,
  registerChatTimelineContext,
} from "./chat-shared";

// Verified against the deployed project (Vercel Hobby plan + Fluid Compute,
// see vercel.json): 300s is the documented maximum for this plan with Fluid
// Compute enabled, not an arbitrary raise. Traced production runs show the
// Executive Agent itself completing deep cross-domain turns in 5-17s
// (turnCount 2, tools already parallel) — the prior 60s ceiling was cutting
// into cold-start/upstream-latency headroom, not actual wasted agent work.
export const maxDuration = 300;

// Failure honesty (constitution): the one message shown — live in the
// stream and in the persisted record — whenever the Executive Agent run
// does not complete (timeout or error), instead of ever surfacing or
// saving an empty response as if it were a real answer.
const EXECUTIVE_AGENT_TIMEOUT_MESSAGE = "Bu isteği yanıtlamak beklenenden uzun sürdü; lütfen tekrar deneyin.";

type ExecutiveBrainPostStreamResult = Readonly<{
  executiveBrain: ExecutiveBrainShadowMetadata;
  executiveAssessment: ExecutiveAssessmentV1;
}>;

const MAX_MESSAGE_LENGTH = 4000;
const FORBIDDEN_CLIENT_FIELDS = [
  "organizationId",
  "userId",
  "actorUserId",
  "provider",
  "promptTemplateId",
] as const;

const CHAT_RATE_LIMIT_MAX_MESSAGES = 20;
const CHAT_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
// Turn-history window threaded into the LLM call (see ConversationHistoryTurn).
// Bounds prompt growth on long-lived conversations; recent turns are what
// context-continuity failures (referencing METRIX's own last reply) need.
const CHAT_HISTORY_MESSAGE_LIMIT = 12;
// Conversation-understanding classification only needs enough of the last
// exchange to resolve a short follow-up ("evet var", "tamamla") — a much
// smaller window than the full generation context above keeps this
// additional read (and the prompt it feeds) cheap.
const CLASSIFICATION_HISTORY_MESSAGE_LIMIT = 4;

function readSafeCorrelationId(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
}

async function isChatRateLimited(params: {
  organizationId: string;
  actorUserId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - CHAT_RATE_LIMIT_WINDOW_MS);
  const recentMessageCount = await prisma.event.count({
    where: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      eventType: USER_MESSAGE_CREATED,
      createdAt: { gte: since },
    },
  });

  return recentMessageCount >= CHAT_RATE_LIMIT_MAX_MESSAGES;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const correlationId = readSafeCorrelationId(request.headers.get("X-Correlation-Id")) ?? requestId;
  const clientTurnId = readSafeCorrelationId(request.headers.get("X-Turn-Id"));
  const requestStartAt = performance.now();
  registerChatTimelineContext(requestId, {
    correlationId,
    turnId: clientTurnId ?? undefined,
    channel: request.headers.get("X-Metrix-Channel") === "voice" ? "voice" : "text",
  });
  logChatLatency(requestId, requestStartAt, "request_received");

  const profiler = createRequestProfiler("chat");
  profiler.markStart("route_total");
  try {
    logChatLatency(requestId, requestStartAt, "auth_context_start");
    logChatLatency(requestId, requestStartAt, "auth_start");
    const authStartedAt = performance.now();
    const authContext = await requireAuthContextFromCookies(undefined, {
      requestId,
      requestStartAt,
    });
    logChatLatency(requestId, requestStartAt, "auth_context_done", {
      segmentMs: Math.round(performance.now() - authStartedAt),
    });
    logChatLatency(requestId, requestStartAt, "auth_done");

    const rateLimitStartedAt = performance.now();
    const rateLimited = await isChatRateLimited({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
    });
    logChatLatency(requestId, requestStartAt, "rate_limit_done", {
      segmentMs: Math.round(performance.now() - rateLimitStartedAt),
    });
    if (rateLimited) {
      profiler.markEnd("route_total");
      profiler.finish();
      return fail("Çok fazla mesaj gönderdin. Birkaç dakika sonra tekrar dener misin?", 429);
    }

    const body = await readJsonObject(request);
    assertNoForbiddenClientFields(body);
    const activeWorkspaceContext = body.activeWorkspaceContext === undefined || body.activeWorkspaceContext === null
      ? null
      : validateActiveWorkspaceContext(body.activeWorkspaceContext);
    if (body.activeWorkspaceContext !== undefined && body.activeWorkspaceContext !== null && !activeWorkspaceContext) {
      throw new ApiValidationError("activeWorkspaceContext is invalid.");
    }
    logChatLatency(requestId, requestStartAt, "body_parsed", {
      activeWorkspaceContext: JSON.stringify(activeWorkspaceContext),
    });

    const message = readChatMessage(body);
    const conversationExtensionHandoff = body.conversationExtensionHandoff === undefined
      ? null
      : validateConversationExtensionHandoff(body.conversationExtensionHandoff);
    if (body.conversationExtensionHandoff !== undefined && !conversationExtensionHandoff) {
      throw new ApiValidationError("conversationExtensionHandoff is invalid.");
    }
    if (conversationExtensionHandoff) {
      emitCustomerLifecycle("CustomerConversation", {
        event: "canonical_handoff_received",
        correlationId,
        operation: conversationExtensionHandoff.operation,
        outcomeCode: conversationExtensionHandoff.outcomeCode,
        fieldCount: conversationExtensionHandoff.fieldCount,
        mutationPerformed: conversationExtensionHandoff.mutationPerformed,
        navigationRequested: conversationExtensionHandoff.navigationRequested,
        navigationStatus: conversationExtensionHandoff.navigationStatus,
        failureCode: conversationExtensionHandoff.failureCode,
        approvalRequired: conversationExtensionHandoff.approvalRequired,
        canonicalBypass: false,
        assistantOwner: "CANONICAL_CHAT",
      });
    }
    // See isNavigationBlindHandoff's own doc comment for why that specific
    // handoff shape must not be treated as this turn's authoritative,
    // already-decided outcome. Legacy Conversation Ownership & Dangling
    // Stream Closure adds isProvisionalConversationHandoff here for the
    // same reason: a weak/OBSERVED claim (a domain extension recognizing a
    // mutation it has no execution path for, or a NOT_FOUND that may just
    // mean "wrong domain") used to still count as this turn's authoritative
    // outcome once the retired generic orchestration fallback was no longer
    // there to complete it — silently dead-ending the turn instead of
    // letting the METRIX Executive Agent decide and execute it. Every other
    // handoff (a real, final claim) is unaffected.
    const authoritativeConversationExtensionHandoff = (isNavigationBlindHandoff(conversationExtensionHandoff) || isProvisionalConversationHandoff(conversationExtensionHandoff)) ? null : conversationExtensionHandoff;
    // Precomputed here (before the model is ever called) because it depends
    // only on conversationExtensionHandoff, which is already fully known
    // from the request body. Whenever this is non-null, the primary model
    // stream below must never be shown to the user raw: the model has no
    // way to know this turn's outcome is already deterministically decided,
    // and reliably narrates a plausible-sounding but wrong result (most
    // often a capability denial) for the ~1-3s it takes to generate,
    // before this same value overwrites aiContent further down. Computing
    // it early lets the primary phase enqueue this instead of the model's
    // raw tokens, closing that live-fabrication window entirely instead of
    // only correcting it after the fact once the "done" event lands.
    const precomputedDeterministicHandoffMessage = authoritativeConversationExtensionHandoff
      ? buildCustomerCreateHandoffMessage(authoritativeConversationExtensionHandoff) ?? buildUniversalHandoffMessage(authoritativeConversationExtensionHandoff)
      : null;
    const channel = optionalStringEnum(body, "channel", ["voice", "text"] as const) ?? "text";
    registerChatTimelineContext(requestId, {
      correlationId,
      turnId: clientTurnId ?? undefined,
      channel,
    });
    if (channel === "voice") {
      logChatLatency(requestId, requestStartAt, "voice_v4_request_received");
    }
    const readinessStartedAt = performance.now();
    const responseReadiness = resolveTextResponseReadiness(message);
    logChatLatency(requestId, requestStartAt, "response_readiness_resolved", {
      readinessMode: responseReadiness.mode,
      statusCategory: responseReadiness.statusCategory ?? undefined,
      elapsedMs: Math.round(performance.now() - readinessStartedAt),
    });
    logChatLatency(
      requestId,
      requestStartAt,
      responseReadiness.mode === "immediate" ? "immediate_generation_start" : "blocking_pipeline_selected",
      { readinessMode: responseReadiness.mode, statusCategory: responseReadiness.statusCategory ?? undefined },
    );
    if (channel === "text" && responseReadiness.statusCategory) {
      logChatLatency(requestId, requestStartAt, "status_event_sent", {
        statusCategory: responseReadiness.statusCategory,
        delivery: "client_readiness_contract",
      });
    }
    const classificationStartedAt = performance.now();
    logChatLatency(requestId, requestStartAt, "classification_start");
    const fastPathResult = tryFastPathClassification(message);
    const deterministicManagementIntent = recognizeManagementIntent(message);
    // COMPANY_SURFACE_NAVIGATION: whether the Company/Integrations Workspace
    // opens must never depend on the LLM classifier succeeding on this one
    // intent (see company-surface-navigation.ts's own doc comment for the
    // production incident this fixes) — same deterministic-wins-over-LLM
    // priority tier as deterministicManagementIntent above.
    const deterministicCompanySurfaceNavigation = recognizeCompanySurfaceNavigation(message);
    if (fastPathResult.matched) {
      logChatLatency(requestId, requestStartAt, "classification_fast_path", {
        matchedRule: fastPathResult.matchedRule,
      });
    } else {
      logChatLatency(requestId, requestStartAt, "classification_fast_path_miss", {
        length: fastPathResult.length,
        normalizedLength: fastPathResult.normalizedLength,
        blockedReason: fastPathResult.blockedReason,
      });
    }
    const runtimeResolution = resolveConversationRuntime({
      readiness: responseReadiness,
    });
    // Delivery channel is not a reasoning authority. Fast-path understanding
    // remains zero-provider; every other request uses the single canonical
    // Conversation Understanding owner. Start it before independent reads so
    // provider latency overlaps conversation and memory loading.
    //
    // responseReadiness/resolveTextResponseReadiness exists ONLY to pick a
    // "typing..." status string for the client (see that module's own
    // "never decides the answer" invariant) — it must never itself become a
    // ConversationUnderstanding authority. A prior revision special-cased
    // the "executive_analysis" status category into a hardcoded,
    // message-blind understanding (businessNavigation always null), which
    // silently suppressed real navigation/classification for any message
    // matching that category's loose keyword regex. The other five status
    // categories were never given this shortcut, which is itself evidence
    // it was drift, not a deliberate exception. Removed — every non-fast-path,
    // non-deterministic message now always reaches classifyConversation.
    const conversationId = optionalString(body, "conversationId");
    // Short follow-up turns ("evet var", "tamamla", "tamam ver") are
    // unclassifiable in isolation and were previously falling to
    // `belirsiz` because this call never saw prior turns. Fetched as its
    // own promise (never awaited here) so classifyPromise is still
    // constructed synchronously and the provider call still starts without
    // waiting on the independent reads below — only chained onto, not
    // blocking, the classification path, and only on the real-provider
    // branch (never the zero-provider fast-path/readiness branches).
    // A DB hiccup here must never fail classification outright — that would
    // bypass classifyConversation's own try/catch (SAFE_FALLBACK) entirely
    // and surface as a bare route-level error instead of a graceful
    // clarification-seeking response. Missing history just means the
    // provider classifies the message without prior-turn context.
    const classificationRecentMessagesPromise = !deterministicManagementIntent && !deterministicCompanySurfaceNavigation && !fastPathResult.matched && conversationId
      ? listRecentMessagesByConversation(conversationId, CLASSIFICATION_HISTORY_MESSAGE_LIMIT, authContext.organization.id)
          .then((items) => items.map((item) => `${item.senderType === "USER" ? "Kullanıcı" : "METRIX"}: ${item.content}`))
          .catch(() => undefined)
      : Promise.resolve(undefined);
    const classifyPromise = deterministicManagementIntent
      ? Promise.resolve(buildManagementIntentUnderstanding(deterministicManagementIntent))
      : deterministicCompanySurfaceNavigation
        ? Promise.resolve(buildCompanySurfaceNavigationUnderstanding(deterministicCompanySurfaceNavigation))
      : fastPathResult.matched
        ? Promise.resolve(fastPathResult.understanding)
        : classificationRecentMessagesPromise.then((recentMessages) => classifyConversation({ message, recentMessages }));

    // FAZ 6: conversation resolution and active-memory loading are
    // independent reads (different tables, neither's input depends on the
    // other's result) that were previously forced serial by code ordering
    // alone. Running them concurrently removes that dead time from the
    // pre-generation critical path; both "_done" marks below now land at
    // effectively the same instant by design — that collapse is the
    // evidence the fix is active, not a measurement bug.
    profiler.markStart("conversation_resolve");
    const conversationAndMemoryStartedAt = performance.now();
    logChatLatency(requestId, requestStartAt, "conversation_resolve_start");
    profiler.markStart("active_memory_fetch");
    logChatLatency(requestId, requestStartAt, "memory_context_loading_start");
    logChatLatency(requestId, requestStartAt, "memory_load_start");

    const [conversation, activeMemoryItems] = await Promise.all([
      resolveChatConversation({
        organizationId: authContext.organization.id,
        userId: authContext.user.id,
        message,
        conversationId,
      }),
      listActiveMemoryItemsByOrganization(authContext.organization.id),
    ]);

    profiler.markEnd("conversation_resolve");
    logChatLatency(requestId, requestStartAt, "conversation_resolve_done", {
      segmentMs: Math.round(performance.now() - conversationAndMemoryStartedAt),
    });
    profiler.markEnd("active_memory_fetch");
    logChatLatency(requestId, requestStartAt, "memory_context_loading_done", {
      segmentMs: Math.round(performance.now() - conversationAndMemoryStartedAt),
    });
    logChatLatency(requestId, requestStartAt, "memory_load_done");

    if (!conversation) {
      return fail("Conversation is not available for this organization.", 403);
    }
    // Build the canonical, evidence-backed response in parallel with the
    // short METRIX opening below. The opening never resolves the turn and
    // never replaces this promise; it is only the first streamed part of the
    // same HTTP response.
    const canonicalResponsePromise = (async (): Promise<Response> => {
    const executiveRuntimeTrace = createExecutiveRuntimeTraceV1({
      requestId,
      correlationId,
      turnId: clientTurnId ?? undefined,
      conversationId: conversation.id,
      organizationId: authContext.organization.id,
      channel,
    });
    const requestMemoryContext = buildMemoryContextFromItems({
      organizationId: authContext.organization.id,
      activeItems: activeMemoryItems,
    });

    const managerAdviceAnalysis = analyzeManagerAdvice({
      message,
      activeMemories: activeMemoryItems,
    });
    const gapResult = detectExecutiveGap({ message, analysis: managerAdviceAnalysis });
    // Voice and text continue through this same response producer.
    const managerAdviceBrief =
      buildManagerAdviceBrief(managerAdviceAnalysis);
    const managerAdviceResponseDraft =
      buildManagerAdviceResponseDraft(managerAdviceBrief);
    const managerAdviceComposedResponse = composeManagerAdviceResponse(
      managerAdviceResponseDraft,
    );
    const baseManagerAdviceAugmentationContext =
      buildManagerAdviceAugmentationContext({
        analysis: managerAdviceAnalysis,
        brief: managerAdviceBrief,
        responseDraft: managerAdviceResponseDraft,
        composedResponse: managerAdviceComposedResponse,
      });
    const managerAdviceAugmentationContext = baseManagerAdviceAugmentationContext
      ? {
          ...baseManagerAdviceAugmentationContext,
          executiveGapSignal: gapResult.hasGap ? {
            reason: gapResult.reason,
            category: managerAdviceAnalysis.category,
            readiness: managerAdviceAnalysis.readiness,
          } : null,
        }
      : null;

    profiler.markStart("conversation_classify");
    const conversationUnderstanding = await classifyPromise;
    profiler.markEnd("conversation_classify");
    executiveRuntimeTrace.observeConversationUnderstanding(
      conversationUnderstanding,
      performance.now() - classificationStartedAt,
    );
    const observedNavigation = conversationUnderstanding.businessNavigation ?? null;
    const calendarClock = observedNavigation?.domain === "calendar"
      ? createCalendarClock(new Date(), authContext.user.timezone)
      : undefined;
    // Phase B (external evidence): suppressed whenever businessNavigation is
    // also present, so a misclassification can never route an internal
    // company-truth turn to the web — internal domains always win. Started
    // here (not awaited until the evidence-lines array below is built) so
    // the web lookup overlaps the rest of this turn's business-evidence
    // gathering instead of adding its own latency on top, the same
    // start-early/await-late pattern already used throughout this function.
    const externalEvidenceNeed = observedNavigation ? null : conversationUnderstanding.externalEvidenceNeed ?? null;
    const externalEvidencePromise = externalEvidenceNeed
      ? resolveLiveExternalEvidence(externalEvidenceNeed)
      : null;
    // Google (Gmail + Calendar) evidence: same start-early/await-late
    // pattern as external evidence above, and the same single seam
    // principle — route.ts never talks to the Gmail/Calendar services or
    // the Google ConnectorAdapter directly, only resolveGoogleEvidence
    // (Company Intelligence's own orchestration, see google-evidence.ts).
    // Deterministic detection only (no LLM, no cost when the turn doesn't
    // need it) — mirrors isCanonicalBusinessFactListRequest's own
    // pre-LLM-classification pattern elsewhere in this file. entityReference
    // reuses businessNavigation's own extracted entity mention — not a
    // second, Google-specific extraction.
    const googleEvidenceNeed = detectGoogleEvidenceNeed(message);
    const googleEvidencePromise = googleEvidenceNeed
      ? resolveGoogleEvidence(googleEvidenceNeed, { organizationId: authContext.organization.id, userId: authContext.user.id, entityReference: observedNavigation?.entityReference ?? null })
      : null;
    // Phase D1/D2 (Work Tool / Excel-Word-PDF export): same suppression
    // principle as external evidence above — a resolved businessNavigation
    // always wins, so an export request can never race a workspace-opening
    // Grand Consolidation Operation (follow-up correction 1): artifact
    // generation is no longer a second, independent delivery authority.
    // artifactRequest stays a deterministic FORMAT signal only (rule 12
    // allows this) — the METRIX Executive Agent is the semantic owner of
    // whether/which dataset gets exported, via generate_collections_artifact
    // (src/lib/executive-agent/tools/artifact-tool.ts), which calls the same
    // generateCollectionsArtifact/canonical Settlement dataset this used to
    // call directly. No proactive generation happens here anymore.
    const artifactRequest = observedNavigation ? null : conversationUnderstanding.artifactRequest ?? null;
    emitBusinessNavigationTelemetry("BusinessNavigation", {
      event: "understanding_observed", correlationId,
      channel: channel === "voice" ? "voice" : "written",
      businessNavigationPresent: observedNavigation !== null,
      operation: observedNavigation?.operation ?? null,
      domain: observedNavigation?.domain ?? null,
      target: observedNavigation?.target ?? null,
      entityReferencePresent: Boolean(observedNavigation?.entityReference),
      understandingConfidence: conversationUnderstanding.confidence,
      validationStatus: observedNavigation ? "VALID" : "ABSENT",
    });
    const navigationResolutionStartedAt = performance.now();
    const businessNavigationResolution = await resolveBusinessNavigation({
      understanding: conversationUnderstanding,
      activeWorkspaceContext,
      calendarClock,
      // status: "ACTIVE" — must agree with the canonical /api/customers
      // route (src/app/api/customers/route.ts), which defaults to ACTIVE
      // when no status is requested; that's what the Living Workspace
      // Customers panel calls, and what "aktif müşteri kayıtları" means to
      // the user. Without this filter (confirmed live), this query pulled
      // every status including old PASSIVE/BLOCKED test fixtures the panel
      // correctly hides, so "müşterilerimi göster" reported a different,
      // larger count with unfamiliar names than the canonical panel open
      // right beside it in the same turn.
      listCustomers: async () => conversationUnderstanding.businessNavigation?.domain === "customer" || conversationUnderstanding.businessNavigation?.domain === "offer"
        ? prisma.customer.findMany({
            where: { organizationId: authContext.organization.id, status: "ACTIVE" },
            select: { id: true, displayName: true, legalName: true, phone: true, email: true, cariKodu: true, taxNumber: true },
          })
        : [],
      findLatestQuoteIdForCustomer: async (customerId) => {
        // No status filter — must agree with the client-side conversation
        // extension's own lookup (listQuotes() in quotes-client.ts, which is
        // unfiltered), or the two authorities can disagree on whether a
        // quote exists at all for the same customer.
        const quote = await prisma.quote.findFirst({
          where: { organizationId: authContext.organization.id, customerId },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        return quote?.id ?? null;
      },
      listDomainRecords: buildListableDomainSnapshotFetcher(authContext.organization.id),
    });
    const descriptorKind = businessNavigationResolution.status === "RESOLVED" ? businessNavigationResolution.descriptor.kind : null;
    const safeResolutionStatus = businessNavigationResolution.status === "NOT_NAVIGATION" ? "NOT_REQUESTED" : businessNavigationResolution.status === "UNAVAILABLE" ? "UNSUPPORTED" : businessNavigationResolution.status === "CLARIFICATION_REQUIRED" && businessNavigationResolution.reason === "AMBIGUOUS_ENTITY" ? "AMBIGUOUS" : businessNavigationResolution.status;
    emitBusinessNavigationTelemetry("BusinessNavigation", {
      event: "resolution_completed", correlationId, status: safeResolutionStatus,
      descriptorKind, entityMatchCount: businessNavigationResolution.status === "RESOLVED" && businessNavigationResolution.descriptor.domain === "customer" && ["customer.detail", "customer.edit"].includes(businessNavigationResolution.descriptor.kind) ? 1 : 0,
      confidence: businessNavigationResolution.status === "RESOLVED" ? businessNavigationResolution.confidence : conversationUnderstanding.confidence,
      failureCode: businessNavigationResolution.status === "CLARIFICATION_REQUIRED" ? businessNavigationResolution.reason : businessNavigationResolution.status === "NOT_FOUND" ? "ENTITY_NOT_FOUND" : businessNavigationResolution.status === "UNAVAILABLE" ? "CAPABILITY_UNAVAILABLE" : null,
      durationMs: Math.round(performance.now() - navigationResolutionStartedAt),
    });
    logChatLatency(requestId, requestStartAt, "business_navigation_resolved", {
      status: safeResolutionStatus,
      descriptorKind: descriptorKind ?? undefined,
    });
    // Single Executive Intelligence, applied to navigation dispatch as well
    // as narration (see the identical principle where deterministicHandoffMessage
    // is built below): whenever a conversation extension already produced a
    // handoff for this turn — any domain, any outcome — that handoff is the
    // sole authority. business-navigation is a second, uncoordinated
    // classification of the same utterance; letting it independently
    // navigate anyway (the previous, narrower guard only suppressed this for
    // handoffs that were themselves a completed CREATE-navigation) let it
    // silently override an extension's already-decided outcome — e.g. a
    // payment-reminder or orchestration turn correctly declining to act,
    // followed by business-navigation opening an unrelated customer record
    // because it separately recognized a customer name in the same message.
    // The one narrow exception (authoritativeConversationExtensionHandoff,
    // defined above): a domain-blind orchestration CLARIFICATION_REQUIRED
    // cannot possibly be that kind of already-decided outcome for a
    // navigation-shaped turn — Action Registry has no navigate concept — so
    // it must not veto business-navigation's own, independent resolution.
    let executiveNavigationInput = businessNavigationResolution.status === "RESOLVED" && !authoritativeConversationExtensionHandoff
      ? projectBusinessNavigation(businessNavigationResolution.descriptor)
      : null;
    let executiveNavigationCommandId = executiveNavigationInput ? crypto.randomUUID() : null;
    // Navigation fast path: this is the point at which a real
    // ExecutiveNavigationCommand is fully ready to enqueue — the client can
    // dispatch it and open the Workspace surface without waiting on any of
    // the (much slower) Executive Brain reasoning/narration below. Logged
    // here, not only when the stream actually enqueues it later, so the
    // turn-level trace shows exactly how early this was ready relative to
    // the eventual response.
    if (executiveNavigationInput) {
      logChatLatency(requestId, requestStartAt, "navigation_command_ready", {
        routeType: businessNavigationRouteType(executiveNavigationInput.route),
      });
    }
    // Single Response Ownership fix: the opening call is a second,
    // independent model invocation with zero awareness of business
    // navigation (createMetrixOpeningStream is given an empty evidence
    // context) — when a real ExecutiveNavigationCommand is being dispatched
    // this turn, that independence is exactly what let it narrate as though
    // the navigation hadn't happened (confirmed live: "Şirketimin
    // entegrasyonlarını aç." opened the Workspace, then a full,
    // multi-sentence opening paragraph asked which integration was meant,
    // before the canonical answer — correctly informed by
    // NAVIGATION_RESOLVED evidence — arrived seconds later and contradicted
    // it). The open Workspace surface is already the immediate visual
    // feedback for these turns, so the filler is also redundant, not just
    // risky — skipping it removes the second model call entirely rather
    // than trying to synchronize two independent generations or
    // deduplicating their text after the fact. Computed here (immediately
    // after executiveNavigationInput's primary resolution — the two later
    // fallback reassignments below are comparatively rare paths, not this
    // fast path's target) rather than after this whole IIFE resolves, so
    // the opening call still starts as early as the now-known navigation
    // outcome allows, not after the full Executive Brain response.
    const openingEnabled = responseReadiness.mode === "progress" && !fastPathResult.matched && !executiveNavigationInput;
    const openingStartedAt = performance.now();
    const openingHandle = openingEnabled
      ? createMetrixOpeningStream({
          organizationId: authContext.organization.id,
          conversationId: conversation.id,
          message,
          channel,
        })
      : null;
    const businessNavigationOperationEvidence = projectBusinessNavigationOperationEvidence(businessNavigationResolution);
    // Navigation Truth guard (2/2, same production regression as
    // authoritativeConversationExtensionHandoff above): businessNavigationOperationEvidence
    // is projected straight from businessNavigationResolution and knows nothing about
    // executiveNavigationInput having just been vetoed on the line above — so on a
    // vetoed turn (a REAL, different-domain handoff already owns this turn, and
    // business-navigation separately also resolved) its RESOLVED outcome would still
    // let the deterministic navigation message and the prompt evidence line below
    // assert a Living Workspace surface "was requested"/opened/shown, a second, false
    // claim racing whatever the real handoff — already this turn's sole authority —
    // actually decided. Every presentation-claiming narration path must derive from
    // this variable, never the raw evidence above; business-truth-only consumers
    // (canonicalCustomerResolved, isCustomerListTurn/isDomainListTurn, telemetry) keep
    // reading the raw evidence, since whether the customer was actually found in the
    // repository is real and unaffected by whether its surface got a chance to open.
    // Scoped to exactly the RESOLVED+vetoed combination: every non-vetoed
    // CUSTOMER_LOOKUP/CUSTOMER_LIST/CUSTOMER_CREATE/CALENDAR_OPEN/DOMAIN_LIST turn —
    // including informational lookups, which still dispatch — is untouched.
    const businessNavigationDispatchVetoed = businessNavigationResolution.status === "RESOLVED" && Boolean(authoritativeConversationExtensionHandoff);
    const businessNavigationPresentationEvidence = businessNavigationDispatchVetoed ? null : businessNavigationOperationEvidence;
    // An informational ask ("X hakkında bilgi ver") about a named customer
    // resolves through the same CUSTOMER_LOOKUP path as a "show me X"
    // navigation command, but must be narrated from the real detailSnapshot
    // evidence, not the generic navigation acknowledgment below (which never
    // carries any customer content) — see buildBusinessNavigationMessage's
    // CUSTOMER_LOOKUP/RESOLVED case. Computed here (not only below, where it
    // used to live) because it now also gates precomputedBusinessNavigationMessage.
    const isInformationalCustomerLookup =
      conversationUnderstanding.userMotivation === "bilgi_almak" &&
      businessNavigationOperationEvidence?.operation === "CUSTOMER_LOOKUP" &&
      businessNavigationOperationEvidence.outcome === "RESOLVED";
    // Precomputed here, before the model is ever called, for the same
    // reason as precomputedDeterministicHandoffMessage above: a
    // CUSTOMER_LIST turn's real record count/names are already fully known
    // from businessNavigationOperationEvidence, with no dependency on
    // anything the model produces. Live testing caught the model narrating
    // this turn with a completely fabricated count and a nonexistent
    // "bayi statüsü" (dealer status) detail, directly contradicting the
    // real 5-customer canonical list the Living Workspace panel opened
    // beside it in the same turn — buildBusinessNavigationMessage had no
    // deterministic case for CUSTOMER_LIST at all (only CUSTOMER_LOOKUP),
    // so the prompt-evidence instruction telling the model to use the real
    // names was the only thing guarding this turn, and it wasn't enough.
    //
    // CUSTOMER_LOOKUP joined this whitelist later: it had the identical bug
    // (buildBusinessNavigationMessage already had a deterministic case for
    // it, but nothing suppressed the model's live stream first), just
    // narrower in visible impact — the model's own narration streamed live,
    // then got silently swapped for the short deterministic line ("İlgili
    // müşteri kaydını açtım." / not-found / ambiguous) the instant "done"
    // landed. Excluded when it's an informational lookup, matching the
    // priority rule below: that one real case must keep the model's own
    // narration, not the generic acknowledgment.
    const precomputedBusinessNavigationMessage = !isInformationalCustomerLookup && (
        businessNavigationOperationEvidence?.operation === "CUSTOMER_LIST" ||
        businessNavigationOperationEvidence?.operation === "CALENDAR_OPEN" ||
        businessNavigationOperationEvidence?.operation === "CUSTOMER_LOOKUP" ||
        businessNavigationOperationEvidence?.operation === "DOMAIN_LIST"
      )
      ? buildBusinessNavigationMessage(businessNavigationPresentationEvidence, calendarClock)
      : null;
    const silentPreparation = conversationUnderstanding.confidence === "high" && businessNavigationResolution.status === "RESOLVED"
      ? { signature: "sessiz.hazirlik", confidence: { level: "high", score: 0.9 }, domain: businessNavigationResolution.descriptor.domain }
      : null;
    // Domain-agnostic: closes whatever Living Workspace surface is currently
    // open on the client, regardless of which domain it is — the client is
    // the only side that knows what's actually open.
    const workspaceCloseRequested = conversationUnderstanding.workspaceControl === "close";
    // Same Gap 2 fix as precomputedBusinessNavigationMessage above, applied
    // to the two lowest-priority deterministic overrides (workspace-close
    // acknowledgment, and "couldn't confirm this mutation happened"): both
    // used to be computed only after the primary stream had already fully
    // run and been sent to the client, so for any turn landing in either
    // case the model's own unvetted narration streamed live and visible for
    // however long generation took, before being silently swapped for the
    // deterministic line once "done" arrived — confirmed live (a "Teklif
    // ekranını doğrudan açamam..." meta-narration line, and a stray
    // contradicting follow-up question, both visible before the real
    // answer). Computing them here, from the same inputs already available
    // at this point in the request, lets the primary-chunk suppression gate
    // below treat them exactly like the other two deterministic cases.
    const precomputedWorkspaceCloseMessage = workspaceCloseRequested ? "Çalışma alanını kapatıp sohbete döndüm." : null;
    const precomputedUnconfirmedMutationMessage = precomputedDeterministicHandoffMessage || precomputedBusinessNavigationMessage || precomputedWorkspaceCloseMessage
      ? null
      : buildUnconfirmedMutationIntentMessage({
          hasHandoff: Boolean(conversationExtensionHandoff),
          shouldInvokeExecutiveBrain: conversationUnderstanding.shouldInvokeExecutiveBrain,
          mutationSurfaceResolved: businessNavigationOperationEvidence?.operation === "MUTATION_SURFACE_RESOLVED",
        });
    // Shared boundary (Legacy Conversation Ownership & Dangling Stream
    // Closure): whenever any of these four deterministic overrides will
    // replace aiContent below, real provider generation is guaranteed to be
    // discarded — narrating it live is already suppressed by the primary-
    // chunk gate downstream. Requesting it anyway is not just waste: it was
    // proven (2026-09-05, requestId 909f3ce6, dep dpl_CQU2A5kTYPZtSRoL5t6Tc7mpUBQA)
    // to be a redundant real-provider call whose invocation did not
    // terminate cleanly, hanging until maxDuration force-killed it — a
    // 504 for a turn whose actual answer had already reached the user in
    // 6.7s. One shared boolean, reused by both the suppression gate and
    // skipProviderGeneration below, so the two can never disagree.
    const hasPrecomputedDeterministicOverride = Boolean(
      precomputedDeterministicHandoffMessage || precomputedBusinessNavigationMessage || precomputedWorkspaceCloseMessage || precomputedUnconfirmedMutationMessage,
    );
    emitBusinessNavigationTelemetry("BusinessNavigation", {
      event: "projection_completed", correlationId, commandId: executiveNavigationCommandId, descriptorKind,
      routeType: executiveNavigationInput ? businessNavigationRouteType(executiveNavigationInput.route) : null,
      expectedSurfaceAuthorityKey: executiveNavigationInput?.expectedSurfaceAuthorityKey ?? null,
      projectionStatus: executiveNavigationInput ? "PROJECTED" : "SKIPPED",
    });
    logChatLatency(requestId, requestStartAt, "classification_done", {
      fastPath: fastPathResult.matched,
      classificationMode: deterministicManagementIntent
        ? "deterministic_management_intent"
        : deterministicCompanySurfaceNavigation
          ? "deterministic_company_surface_navigation"
        : fastPathResult.matched
          ? "deterministic"
          : "provider",
      contextProfile: runtimeResolution.contextProfile,
      segmentMs: Math.round(performance.now() - classificationStartedAt),
    });
    // Grand Consolidation Operation: shouldInvokeExecutiveBrain remains a
    // deterministic pre-filter (is this turn company-relevant at all, vs
    // unambiguous small talk?) — never a "how should METRIX think" router.
    // Retired here: resolveChatExecutiveCognition -> buildExecutiveIntelligence
    // -> buildExecutiveContextV2 + buildExecutiveOperatingSystem, the old
    // 3-call (executive_reasoning, recommended_next_move, eos_learning_loop)
    // pipeline that used to produce the evidence fed into the ONE primary
    // generation. That evidence-preparation + narration split is retired as
    // an independent cognition owner; the METRIX Executive Agent (Agents
    // SDK, src/lib/executive-agent) now both selects its own evidence via
    // real tool calls AND produces the final response itself, in one loop.
    // executiveAgentWillRespond (computed below, once companyQueryPlan's own
    // judgmentNeed signal is available) decides whether the deterministic
    // navigation/handoff/workspace-close fast paths already answered this
    // turn (in which case the Agent never runs) or whether the Agent is the
    // one response owner for it.
    const requiresExecutiveReasoning = conversationUnderstanding.shouldInvokeExecutiveBrain;
    const pictureStartedAt = performance.now();
    console.info("executive_management_picture_start", {
      requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
    });
    const executiveManagementPicture = await buildExecutiveManagementPictureV1({
      organizationId: authContext.organization.id,
      organizationMembershipRole: authContext.membership.role,
      conversationId: conversation.id,
      requestId,
      timeZone: authContext.user.timezone,
      understanding: conversationUnderstanding,
      channel,
      messagePresent: message.trim().length > 0,
      preloadedOrganization: authContext.organization,
      preloadedMemoryItems: activeMemoryItems,
    }).catch((error: unknown) => {
      console.error("executive_management_picture_failed", {
        requestId,
        conversationId: conversation.id,
        organizationId: authContext.organization.id,
        errorReason: safeExecutiveBrainStageError(error),
      });
      throw error;
    });
    const collectionPerformanceTurnFact = projectCollectionPerformanceTurnFact(
      conversationUnderstanding.managementIntent,
      executiveManagementPicture.evidence.records ?? [],
    );
    const deterministicCollectionPerformanceMessage = collectionPerformanceTurnFact
      ? buildCollectionPerformanceResponse(collectionPerformanceTurnFact)
      : conversationUnderstanding.managementIntent?.intent === "COLLECTION_PERFORMANCE"
        ? "Bu dönem için tahsilat hareketlerini doğrulayamadım; Payment durumlarını dönem performansı yerine kullanmayacağım."
        : null;
    const collectionComparisonTurnFact = projectCollectionComparisonTurnFact(
      conversationUnderstanding.managementIntent,
      executiveManagementPicture.evidence.records ?? [],
    );
    const deterministicCollectionComparisonMessage = collectionComparisonTurnFact
      ? buildCollectionComparisonResponse(collectionComparisonTurnFact)
      : conversationUnderstanding.managementIntent?.intent === "COLLECTION_COMPARISON"
        ? "Karşılaştırılan dönemlerin tahsilat hareketlerini doğrulayamadım; Payment durumlarını dönem karşılaştırması yerine kullanmayacağım."
        : null;
    const collectionDriversTurnFact = projectCollectionDriversTurnFact(
      conversationUnderstanding.managementIntent,
      executiveManagementPicture.evidence.records ?? [],
    );
    const deterministicCollectionDriversMessage = collectionDriversTurnFact
      ? buildCollectionDriversResponse(collectionDriversTurnFact)
      : conversationUnderstanding.managementIntent?.intent === "COLLECTION_DRIVERS"
        ? "Karşılaştırılan dönemlerin tahsilat bileşenlerini doğrulayamadım; kanıtlanmamış bir neden üretmeyeceğim."
        : null;
    const collectionTargetTurnFact = projectCollectionTargetTurnFact(
      conversationUnderstanding.managementIntent,
      executiveManagementPicture.evidence.records ?? [],
    );
    const deterministicCollectionTargetMessage = collectionTargetTurnFact
      ? buildCollectionTargetResponse(collectionTargetTurnFact)
      : conversationUnderstanding.managementIntent?.intent === "COLLECTION_TARGET_POSITION"
        ? "Bu dönem için tahsilat hedefi ve gerçekleşmesini doğrulayamadım; Payment toplamlarını hedef gerçekleşmesi yerine kullanmayacağım."
        : null;
    const quoteActivityIntent = conversationUnderstanding.managementIntent?.intent === "QUOTE_ACTIVITY"
      ? conversationUnderstanding.managementIntent
      : null;
    const quoteActivityDataset = quoteActivityIntent
      ? await buildQuoteActivityDataset(authContext.organization.id, { intent: quoteActivityIntent, now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone })
      : null;
    const deterministicQuoteActivityMessage = quoteActivityDataset ? buildQuoteActivityResponse(quoteActivityDataset) : null;
    const managementIntent = conversationUnderstanding.managementIntent;
    const quoteCohortIntent = managementIntent?.intent === "QUOTE_COHORT" ? managementIntent : null;
    const quoteCohortDataset = quoteCohortIntent ? await buildQuoteSentCohortDataset(authContext.organization.id, { intent: quoteCohortIntent, now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone }) : null;
    const deterministicQuoteCohortMessage = quoteCohortDataset ? buildQuoteSentCohortResponse(quoteCohortDataset) : null;
    const orderBacklogIntent = managementIntent?.intent === "ORDER_BACKLOG" ? managementIntent : null;
    const orderBacklogDataset = orderBacklogIntent ? await buildCurrentOrderBacklogDataset(authContext.organization.id, orderBacklogIntent) : null;
    const deterministicOrderBacklogMessage = orderBacklogDataset ? buildCurrentOrderBacklogResponse(orderBacklogDataset) : null;
    const confirmedOrderFlowIntent = managementIntent?.intent === "CONFIRMED_ORDER_FLOW" ? managementIntent : null;
    const confirmedOrderFlowDataset = confirmedOrderFlowIntent ? await buildConfirmedOrderFlowDataset(authContext.organization.id, { intent: confirmedOrderFlowIntent, now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone }) : null;
    const deterministicConfirmedOrderFlowMessage = confirmedOrderFlowDataset ? buildConfirmedOrderFlowResponse(confirmedOrderFlowDataset) : null;
    const quotePipelineIntent = managementIntent?.intent === "QUOTE_PIPELINE"
      ? managementIntent
      : null;
    const needsQuotePipeline = Boolean(quotePipelineIntent || managementIntent?.intent === "CUSTOMER_MANAGEMENT_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_ATTENTION");
    const quotePipelineDataset = needsQuotePipeline
      ? await buildCurrentQuotePipelineDataset(authContext.organization.id, quotePipelineIntent ?? { intent: "QUOTE_PIPELINE", queryMode: "SUMMARY" })
      : null;
    const deterministicQuotePipelineMessage = quotePipelineIntent && quotePipelineDataset ? buildCurrentQuotePipelineResponse(quotePipelineDataset) : null;
    const intelligenceNow = new Date(executiveManagementPicture.generatedAt);
    const invoicedActivityIntent = managementIntent?.intent === "INVOICED_ACTIVITY" ? managementIntent : null;
    const postedSalesIntent = managementIntent?.intent === "POSTED_SALES" ? managementIntent : null;
    const invoicedActivityDataset = invoicedActivityIntent || postedSalesIntent || managementIntent?.intent === "CUSTOMER_MANAGEMENT_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_ATTENTION"
      ? await buildInvoicedActivityDataset(authContext.organization.id, { intent: invoicedActivityIntent ?? { intent: "INVOICED_ACTIVITY", period: postedSalesIntent?.period ?? "CURRENT_MONTH" }, now: intelligenceNow, timeZone: authContext.user.timezone })
      : null;
    const deterministicInvoicedActivityMessage = invoicedActivityIntent && invoicedActivityDataset ? buildInvoicedActivityResponse(invoicedActivityDataset) : null;
    const deterministicPostedSalesMessage = postedSalesIntent && invoicedActivityDataset ? buildPostedSalesResponse(invoicedActivityDataset) : null;
    const orderOperationsIntent = managementIntent?.intent === "ORDER_OPERATIONS" ? managementIntent : null;
    const needsOperationsOverview = managementIntent?.intent === "OPERATIONS_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_OVERVIEW" || managementIntent?.intent === "COMPANY_MANAGEMENT_ATTENTION";
    const operationsDataset = needsOperationsOverview ? await buildOperationsManagementDataset(authContext.organization.id, { now: intelligenceNow, timeZone: authContext.user.timezone }) : null;
    const orderOperationsDataset = operationsDataset?.orders ?? (orderOperationsIntent || managementIntent?.intent === "CUSTOMER_MANAGEMENT_OVERVIEW" ? await buildCurrentOrderOperationsDataset(authContext.organization.id, { now: intelligenceNow, timeZone: authContext.user.timezone }) : null);
    const deterministicOrderOperationsMessage = orderOperationsIntent && orderOperationsDataset ? buildOrderOperationsResponse(orderOperationsIntent, orderOperationsDataset) : null;
    const deterministicOperationsOverviewMessage = managementIntent?.intent === "OPERATIONS_OVERVIEW" && operationsDataset ? buildOperationsManagementResponse(operationsDataset) : null;
    const receivableIntent = conversationUnderstanding.managementIntent?.intent === "RECEIVABLE_POSITION"
      ? conversationUnderstanding.managementIntent
      : null;
    const receivableDataset = (receivableIntent && receivableIntent.queryMode !== "HISTORICAL_UNSUPPORTED" && receivableIntent.queryMode !== "DSO_UNSUPPORTED") || managementIntent?.intent === "CUSTOMER_MANAGEMENT_OVERVIEW"
      ? await buildCurrentReceivableDataset(authContext.organization.id, { now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone })
      : null;
    const currentReceivableTurnFact = projectCurrentReceivableTurnFact(receivableIntent, receivableDataset);
    const deterministicCurrentReceivableMessage = currentReceivableTurnFact ? buildCurrentReceivableResponse(currentReceivableTurnFact) : null;
    const financialIntent = conversationUnderstanding.managementIntent;
    let cashPayablesTurnFact: CashPayablesTurnFact | null = null;
    if (financialIntent?.intent === "CASH_POSITION") {
      cashPayablesTurnFact = Object.freeze({ intent: financialIntent, cashPosition: await buildCashPositionDataset(authContext.organization.id, new Date(executiveManagementPicture.generatedAt)) });
    } else if (financialIntent?.intent === "CASH_FLOW") {
      cashPayablesTurnFact = Object.freeze({ intent: financialIntent, cashFlow: await buildCashFlowDataset(authContext.organization.id, { periodKind: financialIntent.period, now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone }) });
    } else if (financialIntent?.intent === "PAYABLE_POSITION") {
      cashPayablesTurnFact = Object.freeze({ intent: financialIntent, ...(financialIntent.queryMode === "HISTORICAL_UNSUPPORTED" ? {} : { payables: await buildCurrentPayableDataset(authContext.organization.id, { now: new Date(executiveManagementPicture.generatedAt), timeZone: authContext.user.timezone }) }) });
    }
    const deterministicCashPayablesMessage = cashPayablesTurnFact ? buildCashPayablesResponse(cashPayablesTurnFact) : null;
    const financialAttentionIntent = conversationUnderstanding.managementIntent?.intent === "FINANCIAL_ATTENTION";
    let deterministicFinancialAttentionMessage: string | null = null;
    if (financialAttentionIntent) {
      const attentionNow = new Date(executiveManagementPicture.generatedAt);
      const [attentionReceivables, attentionPayables, attentionCashPosition] = await Promise.all([
        buildCurrentReceivableDataset(authContext.organization.id, { now: attentionNow, timeZone: authContext.user.timezone }),
        buildCurrentPayableDataset(authContext.organization.id, { now: attentionNow, timeZone: authContext.user.timezone }),
        buildCashPositionDataset(authContext.organization.id, attentionNow),
      ]);
      const currentCollections = projectCollectionPerformanceTurnFact(
        { intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" },
        executiveManagementPicture.evidence.records ?? [],
      );
      deterministicFinancialAttentionMessage = currentCollections
        ? buildFinancialAttentionResponse(evaluateFinancialAttention({ receivables: attentionReceivables, payables: attentionPayables, cashPosition: attentionCashPosition, currentCollections }))
        : "Güncel tahsilat gerçeğini doğrulayamadığım için finansal dikkat değerlendirmesini tamamlayamıyorum.";
    }
    const financialOverviewIntent = conversationUnderstanding.managementIntent?.intent === "FINANCIAL_OVERVIEW";
    const companyOverviewIntent = conversationUnderstanding.managementIntent?.intent === "COMPANY_MANAGEMENT_OVERVIEW";
    const companyAttentionIntent = conversationUnderstanding.managementIntent?.intent === "COMPANY_MANAGEMENT_ATTENTION";
    let deterministicFinancialOverviewMessage: string | null = null;
    let financialOverviewDataset: ReturnType<typeof buildFinancialManagementSynthesis> | null = null;
    if (financialOverviewIntent || companyOverviewIntent || companyAttentionIntent) {
      const overviewNow = new Date(executiveManagementPicture.generatedAt);
      const [overviewReceivables, overviewPayables, overviewCashPosition, overviewCashFlow] = await Promise.all([
        buildCurrentReceivableDataset(authContext.organization.id, { now: overviewNow, timeZone: authContext.user.timezone }),
        buildCurrentPayableDataset(authContext.organization.id, { now: overviewNow, timeZone: authContext.user.timezone }),
        buildCashPositionDataset(authContext.organization.id, overviewNow),
        buildCashFlowDataset(authContext.organization.id, { periodKind: "CURRENT_MONTH", now: overviewNow, timeZone: authContext.user.timezone }),
      ]);
      const overviewCollections = projectCollectionPerformanceTurnFact(
        { intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" },
        executiveManagementPicture.evidence.records ?? [],
      );
      if (overviewCollections) {
        const overviewAttention = evaluateFinancialAttention({ receivables: overviewReceivables, payables: overviewPayables, cashPosition: overviewCashPosition, currentCollections: overviewCollections });
        financialOverviewDataset = buildFinancialManagementSynthesis({ collections: overviewCollections, receivables: overviewReceivables, cashPosition: overviewCashPosition, cashFlow: overviewCashFlow, payables: overviewPayables, attention: overviewAttention });
        deterministicFinancialOverviewMessage = financialOverviewIntent ? buildFinancialManagementSynthesisResponse(financialOverviewDataset) : null;
      } else {
        deterministicFinancialOverviewMessage = "Güncel tahsilat gerçeğini doğrulayamadığım için finansal özeti tamamlayamıyorum.";
      }
    }
    const customerManagementDataset = managementIntent?.intent === "CUSTOMER_MANAGEMENT_OVERVIEW" && receivableDataset && quotePipelineDataset && orderOperationsDataset && invoicedActivityDataset ? buildCustomerManagementDataset(receivableDataset, quotePipelineDataset, orderOperationsDataset, invoicedActivityDataset) : null;
    const deterministicCustomerManagementMessage = customerManagementDataset ? buildCustomerManagementResponse(customerManagementDataset) : null;
    const deterministicCompanyManagementMessage = companyOverviewIntent && financialOverviewDataset && quotePipelineDataset && invoicedActivityDataset && operationsDataset ? buildCompanyManagementResponse({ financial: financialOverviewDataset, quotePipeline: quotePipelineDataset, invoicedActivity: invoicedActivityDataset, operations: operationsDataset }) : null;
    const deterministicCompanyManagementAttentionMessage = companyAttentionIntent && financialOverviewDataset && quotePipelineDataset && invoicedActivityDataset && operationsDataset ? buildCompanyManagementAttentionResponse({ financial: financialOverviewDataset, quotePipeline: quotePipelineDataset, invoicedActivity: invoicedActivityDataset, operations: operationsDataset }) : null;
    const hasCompletedDeterministicCollectionPerformance = Boolean(
      collectionPerformanceTurnFact && deterministicCollectionPerformanceMessage,
    );
    const hasCompletedDeterministicCollectionComparison = Boolean(
      collectionComparisonTurnFact && deterministicCollectionComparisonMessage,
    );
    const hasCompletedDeterministicCollectionDrivers = Boolean(collectionDriversTurnFact && deterministicCollectionDriversMessage);
    const hasCompletedDeterministicCollectionTarget = Boolean(collectionTargetTurnFact && deterministicCollectionTargetMessage);
    const hasCompletedDeterministicCollectionTurn =
      hasCompletedDeterministicCollectionPerformance || hasCompletedDeterministicCollectionComparison || hasCompletedDeterministicCollectionDrivers || hasCompletedDeterministicCollectionTarget;
    const hasCompletedDeterministicReceivableTurn = Boolean(currentReceivableTurnFact && deterministicCurrentReceivableMessage);
    const hasCompletedDeterministicCashPayablesTurn = Boolean(cashPayablesTurnFact && deterministicCashPayablesMessage);
    const hasCompletedDeterministicFinancialAttentionTurn = Boolean(financialAttentionIntent && deterministicFinancialAttentionMessage);
    const hasCompletedDeterministicFinancialOverviewTurn = Boolean(financialOverviewIntent && deterministicFinancialOverviewMessage);
    const hasCompletedDeterministicFinancialTurn = hasCompletedDeterministicCollectionTurn || hasCompletedDeterministicReceivableTurn || hasCompletedDeterministicCashPayablesTurn || hasCompletedDeterministicFinancialAttentionTurn || hasCompletedDeterministicFinancialOverviewTurn;
    const hasCompletedDeterministicQuoteActivityTurn = Boolean(quoteActivityDataset && deterministicQuoteActivityMessage);
    const hasCompletedDeterministicQuotePipelineTurn = Boolean(quotePipelineDataset && deterministicQuotePipelineMessage);
    const hasCompletedDeterministicManagementCompletionTurn = Boolean(deterministicQuoteCohortMessage || deterministicOrderBacklogMessage || deterministicConfirmedOrderFlowMessage || deterministicPostedSalesMessage || deterministicInvoicedActivityMessage || deterministicOrderOperationsMessage || deterministicCustomerManagementMessage || deterministicOperationsOverviewMessage || deterministicCompanyManagementMessage || deterministicCompanyManagementAttentionMessage);
    const hasCompletedDeterministicManagementTurn = hasCompletedDeterministicFinancialTurn || hasCompletedDeterministicQuoteActivityTurn || hasCompletedDeterministicQuotePipelineTurn || hasCompletedDeterministicManagementCompletionTurn;
    // Company Query Authority — the compositional ceiling above the closed
    // managementIntent union: cross-domain set composition, single-customer
    // fact bundles, and historical conversation retrieval. Only reached when
    // nothing above already answered deterministically (mutually exclusive
    // with managementIntent by construction, see conversation-understanding
    // prompt guidance). Facts are always deterministic (existing canonical
    // dataset builders only, no LLM math); judgmentNeed additionally appends
    // a short, separately-generated, clearly-labeled GM opinion on top of
    // those same facts — see company-query-judgment.service.ts for why that
    // extra LLM call can never alter a number it was given.
    // Canonical Operation seam (READ): the same conversation-understanding
    // output (queryPlan) that already reached this point now compiles into
    // a CanonicalOperationV1 and executes through executeCanonicalOperation
    // -> the "company.query" capability -> the real, unchanged
    // executeCompanyQueryPlan. CanonicalOperationResultV1 becomes the
    // authoritative carrier of the result; companyQueryResult below is
    // exactly what executeCompanyQueryPlan would have returned directly —
    // no downstream behavior changes, only the execution boundary does.
    const companyQueryPlan = !hasCompletedDeterministicManagementTurn ? conversationUnderstanding.queryPlan ?? null : null;
    const companyQueryOperationResult = companyQueryPlan
      ? await executeCanonicalOperation(
          {
            operationId: randomUUID(),
            correlationId: requestId,
            organizationId: authContext.organization.id,
            actorId: authContext.user.id,
            source: channel === "voice" ? "voice" : "written",
            type: "QUERY",
            domain: "company",
            entity: { entityType: "company_query" },
            capability: "company.query",
            payload: {
              plan: companyQueryPlan,
              now: executiveManagementPicture.generatedAt,
              timeZone: authContext.user.timezone,
              conversationId: conversation.id,
            },
            revealIntent: { explicit: false },
            provenance: { conversationId: conversation.id },
          },
          { authContext },
        )
      : null;
    if (companyQueryOperationResult && companyQueryOperationResult.status !== "READ_COMPLETED") {
      console.error("company_query_canonical_operation_not_completed", {
        requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
        status: companyQueryOperationResult.status, failureClassification: companyQueryOperationResult.failureClassification,
      });
    }
    const companyQueryResult = companyQueryOperationResult?.status === "READ_COMPLETED"
      ? (companyQueryOperationResult.data as CompanyQueryResult)
      : null;
    const companyQueryFacts = companyQueryResult ? buildCompanyQueryResponse(companyQueryResult) : null;
    // Grand Consolidation Operation (binding correction): buildCompanyQueryJudgment
    // was a second, separate judgment-generating model call living outside
    // the Executive Agent — a judgment producer disguised as a deterministic
    // tool. Retired entirely, not wrapped as a tool. A companyQueryPlan whose
    // judgmentNeed is true no longer gets an appended judgment here; it now
    // falls through to the METRIX Executive Agent (see executiveAgentWillRespond
    // below), which has its own company_query tool and forms its own judgment
    // on top of the same deterministic facts — one judgment producer, not two.
    const deterministicCompanyQueryMessage = companyQueryFacts && !companyQueryPlan!.judgmentNeed ? companyQueryFacts : null;
    const hasCompletedDeterministicCompanyQueryTurn = Boolean(deterministicCompanyQueryMessage);
    // A turn reaches the Executive Agent whenever it needs any company
    // reasoning at all: shouldInvokeExecutiveBrain, a companyQueryPlan that
    // explicitly asked for judgment (the classifier used to consider the
    // retired judgment call sufficient on its own for these), a matched
    // managementIntent/companyQuery fact (their deterministic templates are
    // retired as answer owners — see the comments above — but the turn
    // itself still needs an answer, now from the Agent's own tools), or an
    // artifactRequest (the Agent is the semantic owner of whether/which
    // dataset gets exported — see generate_collections_artifact).
    // Genuinely execution-certain fast paths (handoff/navigation/workspace-
    // close/unconfirmed-mutation) still win over all of this.
    const executiveAgentWillRespond = (requiresExecutiveReasoning || Boolean(companyQueryPlan?.judgmentNeed) || hasCompletedDeterministicManagementTurn || hasCompletedDeterministicCompanyQueryTurn || Boolean(artifactRequest))
      && !hasPrecomputedDeterministicOverride;
    const executiveAgentRunContext: ExecutiveAgentRunContext = {
      organizationId: authContext.organization.id,
      actorId: authContext.user.id,
      organizationName: authContext.organization.name,
      role: authContext.membership.role,
      timeZone: authContext.user.timezone,
      channel: channel === "voice" ? "voice" : "written",
      conversationId: conversation.id,
      requestId,
      correlationId,
      authContext,
    };
    const pictureLatencyMs = Math.round(performance.now() - pictureStartedAt);
    executiveRuntimeTrace.observeManagementPicture(
      executiveManagementPicture,
      pictureLatencyMs,
    );
    const pictureSourceCounts = Object.fromEntries(
      executiveManagementPicture.evidence.sourceReliability.map((source) => [
        source.source, source.signalCount,
      ]),
    );
    console.info("executive_management_picture_complete", {
      requestId,
      conversationId: conversation.id,
      organizationId: authContext.organization.id,
      pictureId: executiveManagementPicture.pictureId,
      executive_management_picture_latency_ms: pictureLatencyMs,
      executive_management_picture_source_counts: pictureSourceCounts,
      executive_management_picture_readiness: executiveManagementPicture.readiness.assessmentReady,
      executive_management_picture_confidence: executiveManagementPicture.confidence.overall,
    });
    const assessmentStartedAt = performance.now();
    console.info("executive_assessment_start", {
      requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
      pictureId: executiveManagementPicture.pictureId,
    });
    const canonicalAssessmentResult =
      buildExecutiveAssessmentFromManagementPicture(executiveManagementPicture);
    const executiveAssessment = canonicalAssessmentResult.assessment;
    executiveRuntimeTrace.observeAssessment(
      executiveAssessment,
      performance.now() - assessmentStartedAt,
    );
    console.info("executive_assessment_complete", {
      requestId,
      conversationId: conversation.id,
      organizationId: authContext.organization.id,
      pictureId: executiveManagementPicture.pictureId,
      assessmentId: executiveAssessment.assessmentId,
      channel,
      executive_assessment_latency_ms: Math.round(performance.now() - assessmentStartedAt),
      executive_assessment_source: executiveAssessment.source,
      executive_assessment_status: executiveAssessment.status,
    });
    // The completed prior turn carries the slow-regime Decision Engine output.
    // Read it before resolving this turn so it can calibrate context without
    // moving heavy executive-brain work onto the Conversation First path.
    profiler.markStart("last_message_fetch");
    const lastMessageStartedAt = performance.now();
    const [lastAiMessage, recentConversationMessages] = conversationId
      ? await Promise.all([
          findLastAiMessageByConversation(conversation.id, authContext.organization.id),
          listRecentMessagesByConversation(conversation.id, CHAT_HISTORY_MESSAGE_LIMIT, authContext.organization.id),
        ])
      : [null, []];
    profiler.markEnd("last_message_fetch");
    logChatLatency(requestId, requestStartAt, "last_message_done", {
      segmentMs: Math.round(performance.now() - lastMessageStartedAt),
    });
    const previousConversationState = extractConversationState(lastAiMessage?.metadata);
    const previousRecentlyAskedKeys = extractRecentlyAskedKeys(lastAiMessage?.metadata);
    const previousTurnArtifacts = readConversationTurnArtifacts(lastAiMessage?.metadata);
    const previousLastOperationContext = readLastSuccessfulOperationContext(lastAiMessage?.metadata);
    const previousDegradedSignals = extractDegradedSignals(lastAiMessage?.metadata);
    const decisionCalibration = extractExecutiveDecisionCalibration(lastAiMessage?.metadata);
    const executivePause = resolveExecutivePause(decisionCalibration);
    const directiveStartedAt = performance.now();
    const executiveDirective = resolveExecutiveDirective({
      understanding: conversationUnderstanding,
      assessment: executiveAssessment,
      decisionCalibration,
    });
    executiveRuntimeTrace.observeDirective(
      executiveDirective,
      performance.now() - directiveStartedAt,
    );
    console.info("executive_directive_resolved", {
      requestId,
      channel,
      source: executiveDirective.source,
      primaryIntent: executiveDirective.primaryIntent,
      interventionLevel: executiveDirective.interventionLevel,
      authorityMode: executiveDirective.authorityMode,
      actionStrategy: executiveDirective.actionStrategy,
      confirmationPolicy: executiveDirective.confirmationPolicy,
      reasoningMode: executiveDirective.reasoningMode,
      requiresExecutiveReasoning: executiveDirective.requiresExecutiveReasoning,
      confidence: executiveDirective.confidence,
    });
    const behaviorStartedAt = performance.now();
    const executiveBehaviorPlan = adaptExecutiveDirectiveToExecutiveBehaviorPlan(
      executiveDirective,
    );
    // ACT_WITH_USER is a conversational intent to prepare/confirm a mutation,
    // not permission to mutate business state. Today the concrete mutation is
    // completed by the separate approved UI/candidate-promotion flow, which
    // enters Action Runtime with persisted, scoped approval; this chat route
    // never calls executeAction directly or bypasses that boundary.
    executiveRuntimeTrace.observeBehaviorPlan(
      executiveBehaviorPlan,
      performance.now() - behaviorStartedAt,
    );
    console.info("executive_directive_projected", {
      requestId,
      channel,
      schemaVersion: executiveDirective.schemaVersion,
      primaryIntent: executiveDirective.primaryIntent,
      primaryBehavior: executiveBehaviorPlan.primaryBehavior,
      requiresExecutiveReasoning: executiveDirective.requiresExecutiveReasoning,
    });
    const livingBehaviorHint = adaptExecutiveBehaviorPlanToLivingHint(executiveBehaviorPlan);
    console.info("executive_behavior_plan_resolved", {
      requestId,
      channel,
      primaryBehavior: executiveBehaviorPlan.primaryBehavior,
      interactionPosture: executiveBehaviorPlan.interactionPosture,
      questionPolicy: executiveBehaviorPlan.questionPolicy,
      challengePolicy: executiveBehaviorPlan.challengePolicy,
      pacingIntent: executiveBehaviorPlan.pacingIntent,
      requiresExecutiveReasoning: executiveBehaviorPlan.requiresExecutiveReasoning,
    });
    console.info("executive_runtime_chain_complete", {
      requestId,
      conversationId: conversation.id,
      organizationId: authContext.organization.id,
      pictureId: executiveManagementPicture.pictureId,
      assessmentId: executiveAssessment.assessmentId,
      directiveSchemaVersion: executiveDirective.schemaVersion,
      behaviorSchemaVersion: executiveBehaviorPlan.schemaVersion,
    });

    logChatLatency(requestId, requestStartAt, "executive_brain_decision_start", {
      requiresExecutiveReasoning,
    });
    profiler.markStart("executive_brain");
    const executiveBrainStartedAt = performance.now();
    const executiveBrainShadow: ExecutiveBrainShadowMetadata = {
      mode: "unavailable",
      generatedAt: new Date().toISOString(),
      reason: "Deferred by Conversation First.",
    };
    profiler.markEnd("executive_brain");
    logChatLatency(requestId, requestStartAt, "executive_brain_decision_done", {
      mode: executiveBrainShadow.mode,
      segmentMs: Math.round(performance.now() - executiveBrainStartedAt),
    });
    const executiveConstitutionContext = buildExecutiveConstitutionContext();
    const executiveCouncilActivation =
      resolveExecutiveCouncilActivation(message);

    // The turn history actually threaded into the LLM call — without this,
    // every provider call is stateless and the model cannot recall its own
    // or the user's prior statements (root cause of Executive Presence
    // context loss on natural-language follow-ups).
    const conversationHistory: ConversationHistoryTurn[] = recentConversationMessages
      .filter((m) => m.senderType === "USER" || m.senderType === "AI")
      .map((m) => ({
        role: m.senderType === "AI" ? "assistant" as const : "user" as const,
        content: m.content,
      }));

    let learningDecision: ExecutiveLearningDecision | null = null;
    try {
      const activeMemoryKeys = activeMemoryItems.map((item) => item.key);
      const industryItem = activeMemoryItems.find((item) => item.key === "industry");
      const businessModelItem = activeMemoryItems.find((item) => item.key === "business_model");
      const gapEngineResult = detectKnowledgeGaps({
        activeMemoryKeys,
        industryValue: industryItem?.value ?? undefined,
        businessModelValue: businessModelItem?.value ?? undefined,
      });
      const isUserAsking = message.trim().endsWith("?");
      const isUserSharing = /vardı|yaptık|aldık|var |satıyoruz|çalışıyoruz|başladık|kapattık|açtık|sattık|tamamladık|istiyorum|istiyoruz|hedefliyorum|hedefliyoruz|planlıyorum|planlıyoruz|büyümek|açmak istiyoruz|\d+\s*(tl|bin|milyon|adet|kişi|çalışan)/i.test(message);
      learningDecision = buildExecutiveLearningDecision({
        gapEngineResult,
        snapshot: {
          messageCount: conversationId ? 5 : 1,
          isUserAsking,
          isUserSharing,
          topicHints: message.split(/\s+/).slice(0, 10),
          recentlyAskedKeys: previousRecentlyAskedKeys,
        },
      });
    } catch (error) {
      console.warn("[LearningDecision] buildExecutiveLearningDecision failed:", error);
    }

    const degradedSignals = new Set<string>();
    profiler.markStart("user_message_write");
    const userMessageWriteStartedAt = performance.now();
    const userMessagePromise = sendUserMessage({
      organizationId: authContext.organization.id,
      conversationId: conversation.id,
      actorUserId: authContext.user.id,
      content: message,
    }).then((result) => {
      profiler.markEnd("user_message_write");
      logChatLatency(requestId, requestStartAt, "user_message_persistence_done", {
        segmentMs: Math.round(performance.now() - userMessageWriteStartedAt),
      });
      return result;
    });
    userMessagePromise.catch((error) => {
      degradedSignals.add("conversation_persistence");
      console.error("[DEGRADED:conversation_persistence] User message could not be persisted", { requestId, conversationId: conversation.id, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
      return undefined;
    });
    type CaptureResult = Awaited<ReturnType<typeof captureLiveCustomerConversation>>;
    type MemoryCandidateResult = Awaited<ReturnType<typeof createDeterministicUpdateCandidates>>;
    type RealityCandidateResult = Awaited<ReturnType<typeof extractAndPersistBusinessCandidates>>;
    let captureActivation: CaptureResult = null;
    let capturePromise: Promise<CaptureResult> | null = null;
    let memoryCandidatesPromise: Promise<MemoryCandidateResult> | null = null;
    let realityCandidatesPromise: Promise<RealityCandidateResult> | null = null;
    const startDeferredInputEffects = () => {
      if (!capturePromise) {
        logChatLatency(requestId, requestStartAt, "capture_deferred_start");
        capturePromise = userMessagePromise.then((userMessage) =>
          captureLiveCustomerConversation({ authContext, utterance: message, channel, captureId: `chat:${userMessage.id}`, correlationId: conversation.id, sourceMessageId: userMessage.id }))
          .then((result) => { logChatLatency(requestId, requestStartAt, "capture_deferred_done"); return result; })
          .catch((error) => { degradedSignals.add("universal_capture"); console.warn("[DEGRADED:universal_capture] live conversation capture failed:", error); return null; });
      }
      if (!memoryCandidatesPromise) {
        profiler.markStart("memory_candidates");
        memoryCandidatesPromise = userMessagePromise.then((userMessage) => createDeterministicUpdateCandidates({
          organizationId: authContext.organization.id,
          createdByUserId: authContext.user.id,
          sourceMessageId: userMessage.id,
          message,
          activeMemoryItems,
        })).then(async (result) => {
          const userMessage = await userMessagePromise;
          try {
            const detections = detectExecutiveKnowledge({ message });
            if (detections.length > 0) {
              await createMissingMemoryCandidates({
                organizationId: authContext.organization.id,
                createdByUserId: authContext.user.id,
                candidates: mapKnowledgeDetectionsToMemoryCandidates({ detections, organizationId: authContext.organization.id, createdByUserId: authContext.user.id, sourceMessageId: userMessage.id }),
              });
            }
          } catch (error) {
            degradedSignals.add("knowledge_acquisition"); console.warn("[DEGRADED:knowledge_acquisition] detection/memory candidate flow failed:", error);
          } finally {
            profiler.markEnd("memory_candidates");
          }
          return result;
        }).catch((error) => {
          profiler.markEnd("memory_candidates");
          degradedSignals.add("memory_candidates"); console.warn("[DEGRADED:memory_candidates] deferred candidate flow failed:", error);
          return { created: [], skipped: [] };
        });
      }
      if (!realityCandidatesPromise) {
        profiler.markStart("business_candidate_extraction");
        const extractionStartedAt = performance.now();
        realityCandidatesPromise = userMessagePromise.then((userMessage) =>
          extractAndPersistBusinessCandidates({
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            sourceMessageId: userMessage.id,
            sourceChannel: channel === "voice"
              ? BusinessCandidateSourceChannel.VOICE
              : BusinessCandidateSourceChannel.TEXT,
            sourceAuthority: "USER",
            requestId,
            message,
            generateText: generateBusinessRealityExtractionText,
          }))
          .then((result) => {
            profiler.markEnd("business_candidate_extraction");
            logChatLatency(requestId, requestStartAt, "business_candidate_extraction_done", {
              segmentMs: Math.round(performance.now() - extractionStartedAt),
              candidateCount: result.candidates.length,
            });
            return result;
          })
          .catch((error) => {
            profiler.markEnd("business_candidate_extraction");
            degradedSignals.add("business_candidate_extraction"); console.warn("[DEGRADED:business_candidate_extraction] deferred candidate extraction failed:", error);
            return {
              candidates: [],
              blockedAiGeneratedCount: 0,
              classification: "OTHER" as const,
            };
          });
      }
    };
    completeFirstExperienceAfterNormalTurn(authContext);

    // This turn's real, freshly-computed Action/Evidence Runtime result —
    // as opposed to buildOrganizationSummary()'s heuristic company summary,
    // which serializeCanonicalExecutivePrompt() deliberately excludes (see
    // executive-authority-consolidation.test.ts). The canonical prompt path
    // (buildBaseMetrixPrompt's early return, taken whenever the four
    // versioned Executive artefacts are present — i.e. every real turn)
    // never reads organizationSummary, so evidence that only lives there
    // silently never reaches the model. This fragment set is threaded to
    // the canonical serializer separately so it survives that branch too.
    const currentFactEntities = deterministicManagementIntent ? [] : detectCanonicalBusinessFactEntities(message);
    const isAmbiguousFollowUp = currentFactEntities.length === 0 && /^(tamam|evet|devam|ver|göster|goster|detaylandır|detaylandir|hepsini|biraz daha|hangileri)\b/iu.test(message.trim());
    const artifactFacts = isAmbiguousFollowUp && previousTurnArtifacts.length > 0
      ? canonicalFactsFromConversationArtifacts(previousTurnArtifacts.filter((artifact) => artifact.organizationId === authContext.organization.id))
      : [];
    const canonicalBusinessFacts = deterministicManagementIntent
      ? []
      : artifactFacts.length > 0
      ? artifactFacts
      : await readCanonicalBusinessFactsForMessage({ organizationId: authContext.organization.id, message });
    if (!executiveNavigationInput && isCanonicalBusinessFactListRequest(message) && canonicalBusinessFacts.some((item) => item.entity === "customers")) {
      executiveNavigationInput = projectBusinessNavigation({ domain: "customer", kind: "customers.list" });
      executiveNavigationCommandId = crypto.randomUUID();
    }
    // Domain-generic operation continuity: a bare "aç bakayım"/"göster"
    // follow-up with no entity named in THIS turn and nothing else already
    // resolved navigation resolves against lastSuccessfulOperationContext
    // (any domain, see last-operation-context.ts) instead of requiring a
    // domain-specific client-side coordinator to have kept its own
    // in-memory state alive across the same session.
    const operationContinuation = !executiveNavigationInput && !authoritativeConversationExtensionHandoff
      ? resolveOperationContinuationNavigation(isBareRevealFollowUp(message), previousLastOperationContext)
      : { status: "NOT_APPLICABLE" as const };
    if (operationContinuation.status === "RESOLVED") {
      executiveNavigationInput = projectBusinessNavigation(operationContinuation.descriptor);
      executiveNavigationCommandId = crypto.randomUUID();
    }
    const canonicalBusinessFactsEvidence = serializeCanonicalBusinessFacts(canonicalBusinessFacts);
    // Computed here rather than passed through conversationExtensionHandoff
    // because that contract has no field for an arbitrary evidence payload
    // — same reasoning as businessNavigationOperationEvidence's detailSnapshot
    // below, computed at narration time instead of threaded from the client.
    const businessOverviewEvidence = conversationExtensionHandoff?.outcomeCode === "BUSINESS_OVERVIEW_READY"
      ? await buildBusinessOverview(authContext.organization.id).catch(() => null)
      : null;
    const externalEvidenceResult = externalEvidencePromise ? await externalEvidencePromise : null;
    const googleEvidenceResult = googleEvidencePromise ? await googleEvidencePromise : null;
    // Retired: EOS-derived cognition observation (reasoning/recommendedNextMove
    // came from the old executive_reasoning/recommended_next_move calls).
    // Kept as a same-shaped, non-cognition metadata record — persisted
    // message metadata still reads its fields — but no LLM call produces it
    // anymore; the Executive Agent's own run result is the real judgment now.
    const cognitionObservation: ChatExecutiveCognitionObservation = {
      status: executiveAgentWillRespond ? "generated_and_consumed" : "skipped_not_required",
      generatedAt: executiveAgentWillRespond ? new Date().toISOString() : null,
      reasoningConfidence: null,
      reasoningSummary: null,
      recommendedNextMove: null,
      urgency: null,
      conversationKind: conversationUnderstanding.conversationKind,
      suggestedHandling: conversationUnderstanding.suggestedHandling,
    };
    // deliverableArtifact (if any) is now resolved from agentRunResult,
    // after the Executive Agent run completes inside the stream body — see
    // its construction near the "done" event below. There is exactly one
    // artifact delivery owner: the Agent's own generate_collections_artifact
    // tool call, which reads the same canonical Settlement dataset this used
    // to call directly (Artifact Truth = Agent truth).
    const canonicalOperationEvidenceLines = [
      collectionPerformanceTurnFact ? buildCollectionPerformancePromptLine(collectionPerformanceTurnFact) : null,
      collectionComparisonTurnFact ? buildCollectionComparisonPromptLine(collectionComparisonTurnFact) : null,
      collectionDriversTurnFact ? buildCollectionDriversPromptLine(collectionDriversTurnFact) : null,
      collectionTargetTurnFact ? buildCollectionTargetPromptLine(collectionTargetTurnFact) : null,
      quoteActivityDataset ? buildQuoteActivityPromptLine(quoteActivityDataset) : null,
      quotePipelineDataset ? buildCurrentQuotePipelinePromptLine(quotePipelineDataset) : null,
      quoteCohortDataset ? buildManagementIntelligencePromptLine("quote sent cohort", quoteCohortDataset) : null,
      orderBacklogDataset ? buildManagementIntelligencePromptLine("current confirmed-order backlog", orderBacklogDataset) : null,
      invoicedActivityDataset ? buildManagementIntelligencePromptLine("invoiced commercial activity", invoicedActivityDataset) : null,
      orderOperationsDataset ? buildManagementIntelligencePromptLine("current order operations", orderOperationsDataset) : null,
      customerManagementDataset ? buildManagementIntelligencePromptLine("customer", customerManagementDataset) : null,
      operationsDataset ? buildManagementIntelligencePromptLine("operations", operationsDataset) : null,
      canonicalBusinessFactsEvidence,
      externalEvidenceNeed && externalEvidenceResult
        ? buildExternalEvidencePromptLine(externalEvidenceNeed, externalEvidenceResult)
        : null,
      googleEvidenceNeed && googleEvidenceResult
        ? buildGoogleEvidencePromptLine(googleEvidenceNeed, googleEvidenceResult)
        : null,
      operationContinuation.status === "UNAVAILABLE"
        ? `The user asked to open/see the record from their last successful action (domain "${operationContinuation.domain}"), but no detail view exists for that domain yet. Say plainly that you don't have a detail view for that kind of record to open — never claim you opened, showed, or navigated to anything, and never invent one.`
        : null,
      authoritativeConversationExtensionHandoff
        ? `Conversation-extension runtime evidence (structured, not user-facing copy), domain "${authoritativeConversationExtensionHandoff.domain}": ${JSON.stringify(authoritativeConversationExtensionHandoff)}. This handoff is the authoritative, already-executed result of the action taken for this turn — you are not resolving this yourself, only narrating it. Never reinterpret, re-resolve, or contradict it, and never independently claim the referenced record is missing, ambiguous, or unavailable when resultStatus is EXECUTED. Treat PROBABLE_CONTEXT_PRESENT as uncertain context, not a confirmed field or mutation. When resultStatus is CLARIFICATION_REQUIRED and entityResolution is AMBIGUOUS, tell the user one or more similarly named records already exist (name them from candidateNames if present) and ask whether they mean an existing one or want to create a new one anyway; this is a real, resolvable ambiguity, not a missing capability. Never describe any CLARIFICATION_REQUIRED or OBSERVED outcome as missing permission, access, connection, or capability — those never apply here.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "IMPORT_DOMAIN_CLARIFICATION_REQUIRED"
        ? `The user asked to import an Excel/CSV file but did not say which kind of record. This IS a real, already-shipped capability — never say it's unsupported, not connected, or unavailable, and never suggest the document/attachment upload flow instead, that is a different feature for images/PDFs and cannot take spreadsheets. Ask which of these it is, in this exact wording so the next turn resolves correctly: Müşteri, Ürün, Fatura, Tedarikçi, Tahsilat, Teklif, Sipariş, Stok, Üretim, İrsaliye. Once they answer with one of these words, they can say "excel'den [alan] aktar" (e.g. "excel'den müşteri aktar") to open it directly.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "PAYMENT_REMINDER_NO_OUTSTANDING_BALANCE"
        ? `The user asked to send a payment reminder to the customer named in their own message. This IS a real, already-shipped capability — never say it's unsupported or unavailable. No reminder was sent, because that customer's real, canonical account balance (already checked) has no outstanding amount right now. Say plainly, using the customer's name from the user's message, that there is nothing to remind them about — do not invent an amount or claim one was sent.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_PARTIALLY_COMPLETED"
        ? `The user asked, in one message, for METRIX to perform multiple steps in sequence (this general multi-step capability is real and already-shipped — never say it's unsupported). At least one of those steps completed for real, but a later step in the same sequence failed before the whole thing finished (this is real backend data, already checked — do not invent which step failed or guess a record name you have no evidence for this turn). Referring back to what the user just asked for, say plainly that part of it was completed and the rest was not, and suggest they try the remaining part again or do it manually; never claim full success.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_COMPENSATED"
        ? `The user asked, in one message, for METRIX to perform multiple steps in sequence. A later step failed, so the whole sequence did NOT complete — but every earlier step that had already run for real was automatically and successfully reversed (this is real backend data, already checked). Say plainly that the request could not be completed and nothing was left half-done — the system is back to a clean state, as if the sequence had never been attempted. Never say it "tamamladım"/succeeded, and never claim partial success; suggest they try again or do it manually.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_COMPENSATION_FAILED"
        ? `The user asked, in one message, for METRIX to perform multiple steps in sequence. A later step failed, and while METRIX attempted to automatically reverse the earlier real changes, that reversal itself could not be completed (this is real backend data, already checked — do not invent which step or guess a record name). Say plainly and without alarm that the request could not be completed and that some of the earlier changes could not be automatically undone — a person should review this in METRIX before doing anything else with the affected records. Never claim success or that everything was cleaned up.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_PLAN_INVALID"
        ? `The user asked, in one message, for METRIX to perform multiple steps in sequence, but one of the requested steps (an irreversible one, like sending something to a customer) was not the last step in the sequence they described. METRIX never runs an irreversible step unless it's the final action, so nothing was executed at all yet. Say plainly that this exact combination/order isn't possible, and ask them to put the irreversible step (sending/dispatching) last, or to split it into two separate requests. Never say the capability itself is unsupported — only that this particular ordering is not allowed.`
        : null,
      businessOverviewEvidence
        ? `The user asked for an overall assessment of their business — income/expenses, active goal progress, production capacity, and standing risks/opportunities, all synthesized together. This IS a real, already-shipped capability — never say it's unsupported. Here is the real, already-computed snapshot (structured, not user-facing copy), read live from canonical Finance/Goal/Production data — never invent a number not present here, never claim a metric is unavailable when its "available" flag is true, and never describe a metric whose "available" flag is false as a real zero: ${JSON.stringify(businessOverviewEvidence)}. Narrate this as a coherent executive assessment in your own words — lead with financialHealthLevel and financialExecutiveSummary, mention goal progress by name and status, mention capacity.utilizationRatio only if goals or production orders actually exist, and close with the real risks/opportunities (or say plainly there are none right now if both arrays are empty).`
        : conversationExtensionHandoff?.outcomeCode === "BUSINESS_OVERVIEW_READY"
          ? "The user asked for an overall business assessment, but the live computation failed just now. Say plainly you couldn't put the assessment together this time and ask them to try again shortly — do not invent any financial or goal figures."
          : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_APPROVED_PARTIALLY_COMPLETED"
        ? `The user just confirmed ("evet"/"onaylıyorum") a multi-step action that was paused waiting for their approval. The approval itself was granted and that specific step completed for real, but a later step in the same sequence failed afterward (this is real backend data, already checked — do not invent which step failed). Say plainly that the approved step was completed and the rest was not, and suggest they try the remaining part again or do it manually; never claim full success.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_APPROVED_AND_COMPENSATED"
        ? `The user just confirmed ("evet"/"onaylıyorum") a multi-step action that was paused waiting for their approval. The approval was granted, but a later step in the same sequence then failed — so every real change made so far, including the one just approved, was automatically and successfully reversed (this is real backend data, already checked). Say plainly that the request could not be completed and nothing was left half-done; never claim success or partial success.`
        : null,
      conversationExtensionHandoff?.outcomeCode === "ORCHESTRATION_APPROVED_COMPENSATION_FAILED"
        ? `The user just confirmed ("evet"/"onaylıyorum") a multi-step action that was paused waiting for their approval. The approval was granted, but a later step then failed, and METRIX's attempt to automatically reverse the earlier real changes could not itself be completed (this is real backend data, already checked). Say plainly and without alarm that the request could not be completed and some earlier changes could not be automatically undone — a person should review this in METRIX. Never claim success.`
        : null,
      businessNavigationPresentationEvidence && businessNavigationPresentationEvidence.operation !== "DOMAIN_LIST"
        ? `Canonical business operation result (structured, not user-facing copy): ${JSON.stringify(buildPromptSafeNavigationEvidence(businessNavigationPresentationEvidence))}. The repository lookup completed. RESOLVED means the canonical customer was found and its Living Workspace surface was requested; acknowledge that result naturally. When createProposalAllowed is true, offer to open a new editable customer draft. When operation is CUSTOMER_LIST, recordNames here is only a representative sample (see recordCount for the real total, and the separate instruction below for exactly how to use it) — never say you don't have or don't know the customers' names, that would contradict the list you just opened. Do not contradict this result or describe it as missing data, access, permission, connection, or capability.`
        : null,
      businessNavigationPresentationEvidence?.operation === "CUSTOMER_LIST"
        ? businessNavigationPresentationEvidence.recordNames.length > 0
          ? buildCustomerListSampleInstruction(businessNavigationPresentationEvidence)
          : `The canonical customer repository is empty for this organization — say plainly that there are no customer records yet, do not say you lack access to the names.`
        : null,
      businessNavigationPresentationEvidence?.operation === "DOMAIN_LIST"
        ? buildDomainListEvidenceInstruction(businessNavigationPresentationEvidence)
        : null,
      businessNavigationPresentationEvidence?.operation === "CUSTOMER_LOOKUP" && businessNavigationPresentationEvidence.outcome === "RESOLVED" && businessNavigationPresentationEvidence.detailSnapshot
        ? `The user asked about a specific named customer. This is that customer's real record, already read from the canonical repository for the surface now open beside you (using it is not fabrication and withholding it is not caution, it is a wrong answer): ${JSON.stringify(businessNavigationPresentationEvidence.detailSnapshot)}. Name the customer and answer using these real fields. Never say you have no information about this customer — the record exists and is shown above; if the user asked for something this record doesn't contain (e.g. balance or payment status), answer what you do have and only note the rest isn't in this record, never deny knowledge of the customer itself.`
        : null,
      businessNavigationPresentationEvidence?.operation === "MUTATION_SURFACE_RESOLVED"
        ? `This turn was recognized as a request to create a new ${businessNavigationPresentationEvidence.domain} record. This is a navigation-only signal — it does NOT confirm any record was actually created, saved, or completed. No conversationExtensionHandoff is attached with an EXECUTED result for this turn. You must not say you created, saved, sent, or completed this record. If a live editable draft surface was opened, say so honestly (e.g. that you opened it for the user to fill in) without claiming the record itself was created; otherwise say plainly you could not confirm this was completed and ask the user to try again or share the missing details.`
        : null,
      businessNavigationPresentationEvidence?.operation === "NAVIGATION_RESOLVED"
        ? `The user's request to open/show/navigate to a specific area of METRIX (internal navigation target: domain "${businessNavigationPresentationEvidence.domain}"${businessNavigationPresentationEvidence.section ? `, section "${businessNavigationPresentationEvidence.section}"` : ""} — never say these internal names to the user) was already deterministically resolved this turn and its Living Workspace surface was opened beside you. This is a completed navigation action, not an open question: never ask which specific item, section, or provider the user meant, never say the request was unclear or insufficient, and never say you lack the information or authority to proceed — the navigation already happened, acknowledge it naturally in your own words. This evidence only confirms the surface was opened; if the request also implied a further action beyond opening it (e.g. actually connecting or creating something), do not claim that further action itself was completed unless separate evidence elsewhere confirms it. Keep this specific acknowledgment brief (1-2 sentences) — it is a simple navigation confirmation, not a deep analysis, unless other evidence in this prompt genuinely calls for more.`
        : null,
      isAmbiguousFollowUp && artifactFacts.length === 0
        ? "This is an ambiguous follow-up, but no valid canonical conversation artifact is available. Ask which records the user means; do not invent names, expose raw IDs, or claim to remember details that are not present."
        : null,
      previousDegradedSignals.length > 0
        ? `Previous turn had degraded internal subsystems (${previousDegradedSignals.join(", ")}). Do not claim those subsystems completed successfully; if the user asks about the affected result, state the limitation briefly and honestly.`
        : null,
    ].filter((line): line is string => Boolean(line));
    const canonicalOperationEvidence = canonicalOperationEvidenceLines.length > 0
      ? canonicalOperationEvidenceLines.join("\n")
      : null;

    const organizationSummary = [
      buildOrganizationSummary(authContext.organization),
      ...canonicalOperationEvidenceLines,
    ].filter(Boolean).join("\n");
    // The METRIX Executive Agent gets only org identity, never the
    // managementIntent/companyQuery pre-fetched evidence dump above — rule
    // 37: minimal starting context, company facts come from the Agent's own
    // tool calls, never a pre-decided evidence line stuffed into its prompt.
    const executiveAgentOrganizationSummary = buildOrganizationSummary(authContext.organization);


    // Retired: EOS is no longer built. The Executive Agent's own tool-calling
    // loop replaces both the old evidence-preparation call and the old
    // "feed EOS's reasoning into the gateway's own generation" prompt slot.
    const learningLoopResult = null;
    const executiveOperatingSystem = null;
    console.info("[ChatExecutiveIntelligence] consumption resolved", {
      status: cognitionObservation.status,
      requiresExecutiveReasoning,
      hasExecutiveOperatingSystem: executiveOperatingSystem !== null,
    });

    // gateway_call_start → gateway_call_ready is a black-box measurement of
    // everything streamWithAiGateway() does internally (operating context
    // build, prompt build, OpenAI request initiation) — that function has no
    // instrumentation of its own on this call path, and its internals live
    // in a different file (src/lib/ai/gateway/ai-gateway.ts), out of this
    // phase's scope. See report for what this implies.
    const gatewayStartedAt = performance.now();
    const conversationGuidanceStartedAt = performance.now();
    // A projected collection-performance fact is already the complete answer.
    // The gateway must still execute its canonical guidance and prompt stages
    // for Executive Runtime ownership, while provider generation is omitted.
    const streamHandle: AiGatewayStreamHandle = await (async () => {
          logChatLatency(requestId, requestStartAt, "gateway_call_start");
          if (
            runtimeResolution.contextProfile === "full_context"
            || (
              channel === "voice"
              && !(responseReadiness.mode === "immediate" && fastPathResult.matched)
            )
          ) {
            logChatLatency(requestId, requestStartAt, "full_context_selected");
          }
          if (!hasCompletedDeterministicManagementTurn && !hasCompletedDeterministicCompanyQueryTurn) {
            logChatLatency(requestId, requestStartAt, "provider_request_start");
          }
          profiler.markStart("gateway_total");
          return streamWithAiGateway({
      requestId,
      correlationId,
      turnId: clientTurnId ?? undefined,
      channel,
      contextProfile: runtimeResolution.contextProfile,
      organizationId: authContext.organization.id,
      conversationId: conversation.id,
      userMessage: message,
      behaviorSurface: channel === "voice" ? "voice" : "chat",
      organizationSummary,
      canonicalOperationEvidence,
      preloadedMemoryContext: requestMemoryContext,
      conversationPresence: {
        recentTurnCount: lastAiMessage ? 1 : 0,
      },
      conversationHistory,
      managerAdviceAugmentationContext: requiresExecutiveReasoning ? managerAdviceAugmentationContext : null,
      executiveBrainContext: executiveBrainShadow,
      executiveConstitutionContext,
      executiveCouncilActivation,
      previousConversationState,
      currentUserId: authContext.user.id,
      currentUserName: authContext.user.fullName,
      organizationMembershipRole: authContext.membership.role,
      learningLoop: learningLoopResult,
      learningDecision,
      learningSnapshot: {
        messageCount: conversationId ? 5 : 1,
        isUserAsking: message.trim().endsWith("?"),
        isUserSharing: /vardı|yaptık|aldık|var |satıyoruz|çalışıyoruz|başladık|kapattık|açtık|sattık|tamamladık|istiyorum|istiyoruz|hedefliyorum|hedefliyoruz|planlıyorum|planlıyoruz|büyümek|açmak istiyoruz|\d+\s*(tl|bin|milyon|adet|kişi|çalışan)/i.test(message),
        topicHints: message.split(/\s+/).slice(0, 10),
        recentlyAskedKeys: previousRecentlyAskedKeys,
      },
      executiveOperatingSystem,
      requiresExecutiveReasoning,
      skipProviderGeneration: hasCompletedDeterministicManagementTurn || hasCompletedDeterministicCompanyQueryTurn || executiveAgentWillRespond || hasPrecomputedDeterministicOverride,
      livingBehaviorHint,
      executiveBehaviorPlan,
      executiveManagementPicture,
      executiveAssessment,
      executiveDirective,
      onExecutiveConversationGuidanceObserved: (guidance) => {
        executiveRuntimeTrace.observeConversationGuidance(
          guidance,
          performance.now() - conversationGuidanceStartedAt,
        );
      },
          });
        })();
    executiveRuntimeTrace.observeCanonicalPrompt(
      streamHandle.pre.systemPrompt,
      performance.now() - gatewayStartedAt,
    );
    logChatLatency(requestId, requestStartAt, "gateway_call_ready", {
      segmentMs: Math.round(performance.now() - gatewayStartedAt),
      contextProfile: runtimeResolution.contextProfile,
      readinessMode: responseReadiness.mode,
      requiresExecutiveReasoning,
      providerGenerationSkipped: hasCompletedDeterministicManagementTurn || hasCompletedDeterministicCompanyQueryTurn,
    });
    const encoder = new TextEncoder();
    // executiveBrain here remains the org-wide STANDING brief (council /
    // strategic profile / decision package / GM brief, built from the
    // management picture, not from this turn's message) — it is
    // deliberately kept post-stream/shadow, feeding only the executive
    // decision-loop audit record and persisted metadata, never narration.
    // Feeding this unconditionally into any live generation previously
    // caused an unrelated org-wide brief to bleed into topically unrelated
    // turns (see buildProgressiveEnrichmentEvidence's retired comment in
    // git history) — that risk is why it stays out of the primary prompt.
    // Turn-specific cognition is NOT part of this anymore: the METRIX
    // Executive Agent (src/lib/executive-agent) now produces the primary
    // generation itself (see executiveAgentWillRespond above); the old EOS
    // pipeline this comment used to describe is retired.
    type ProgressiveIntelligence = {
      executiveBrain: ExecutiveBrainShadowMetadata;
      executiveAssessment: ExecutiveAssessmentV1;
      learningLoop: Awaited<ReturnType<typeof buildLearningLoop>> | null;
    };
    let progressiveIntelligencePromise: Promise<ProgressiveIntelligence> | null = null;
    const startProgressiveIntelligence = () => {
      if (!requiresExecutiveReasoning || progressiveIntelligencePromise) return;
      profiler.markStart("executive_intelligence");
      profiler.markStart("learning_loop");
      logChatLatency(requestId, requestStartAt, "post_stream_intelligence_start", {
        contextProfile: runtimeResolution.contextProfile,
        requiresExecutiveReasoning,
      });
      logChatLatency(requestId, requestStartAt, "post_stream_start");
      progressiveIntelligencePromise = Promise.all([
        requiresExecutiveReasoning
          && executiveManagementPicture.readiness.assessmentReady
          ? buildExecutiveBrainShadowMetadata({
              organizationId: authContext.organization.id,
              organization: authContext.organization,
              activeMemoryItems,
              requestId,
              requestStartAt,
              conversationId: conversation.id,
              channel,
              profiler,
              picture: executiveManagementPicture,
              internalAssessment: canonicalAssessmentResult.internalAssessment,
              canonicalAssessment: executiveAssessment,
            })
          : Promise.resolve({
              executiveBrain: executiveBrainShadow,
              executiveAssessment,
            }),
        buildLearningLoop({
          organizationId: authContext.organization.id,
          activeMemoryItems,
        }),
      ]).then(([executiveBrain, learningLoop]) => {
        profiler.markEnd("executive_intelligence");
        profiler.markEnd("learning_loop");
        logChatLatency(requestId, requestStartAt, "post_stream_intelligence_done", {
          contextProfile: runtimeResolution.contextProfile,
          requiresExecutiveReasoning,
        });
        logChatLatency(requestId, requestStartAt, "post_stream_done");
        return {
          executiveBrain: executiveBrain.executiveBrain,
          executiveAssessment: executiveBrain.executiveAssessment,
          learningLoop,
        };
      }).catch((error) => {
        profiler.markEnd("executive_intelligence");
        profiler.markEnd("learning_loop");
        console.warn("[ConversationFirst] post-stream intelligence failed:", error);
        return {
          executiveBrain: executiveBrainShadow,
          executiveAssessment,
          learningLoop: null,
        };
      });
    };
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let visibleDoneSent = false;
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "signature", signal: executivePause }) + "\n"));
          if (silentPreparation) controller.enqueue(encoder.encode(JSON.stringify({ type: "signature", signal: silentPreparation }) + "\n"));
          if (workspaceCloseRequested) controller.enqueue(encoder.encode(JSON.stringify({ type: "workspace-control", action: "close" }) + "\n"));
          if (executiveNavigationInput) {
            controller.enqueue(encoder.encode(JSON.stringify({
              type: "navigation",
              command: {
                commandId: executiveNavigationCommandId,
                correlationId,
                source: channel === "voice" ? "voice" : "written",
                ...executiveNavigationInput,
              },
            }) + "\n"));
            emitBusinessNavigationTelemetry("BusinessNavigation", {
              event: "stream_event_enqueued", correlationId, commandId: executiveNavigationCommandId, eventType: "navigation",
              routeType: businessNavigationRouteType(executiveNavigationInput.route),
              source: channel === "voice" ? "voice" : "written", commandPresent: true,
              streamState: "BEFORE_FIRST_CHUNK", enqueueStatus: "ENQUEUED",
            });
          } else {
            emitBusinessNavigationTelemetry("BusinessNavigation", {
              event: "stream_event_enqueued", correlationId, eventType: "navigation",
              routeType: null, source: channel === "voice" ? "voice" : "written",
              commandPresent: false, streamState: "BEFORE_FIRST_CHUNK", enqueueStatus: "SKIPPED",
            });
          }
          let loggedFirstUpstreamChunk = false;
          let loggedFirstSseChunkSent = false;
          // Grand Consolidation Operation: the closed managementIntent/
          // companyQuery deterministic answer templates (quote cohort,
          // order backlog, collections, receivables, etc.) and
          // companyQueryJudgmentMessage's separate judgment call are no
          // longer response owners — they were the "pre-decided evidence
          // selection" this operation retires. Their underlying datasets
          // are wrapped as METRIX Executive Agent tools instead (see
          // src/lib/executive-agent/tools) and the Agent now decides which
          // to call and composes its own answer from them, same as any
          // other Executive turn. Only the genuinely execution-certain
          // fast paths (handoff / business navigation / workspace-close /
          // unconfirmed-mutation) remain here as deterministic overrides —
          // rule 5: fast path is an execution optimization, never a
          // cognition owner, so nothing here produces judgment.
          const precomputedDeterministicPrimaryMessage = precomputedDeterministicHandoffMessage ?? precomputedBusinessNavigationMessage ?? precomputedWorkspaceCloseMessage ?? precomputedUnconfirmedMutationMessage;
          if (precomputedDeterministicPrimaryMessage) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: precomputedDeterministicPrimaryMessage, phase: "primary", responseAuthority: "metrix_main_model" }) + "\n"));
          }
          let agentRunResult: ExecutiveAgentRunResult | null = null;
          if (executiveAgentWillRespond) {
            agentRunResult = await runExecutiveAgent(
              executiveAgentRunContext,
              { message, conversationHistory, organizationSummary: executiveAgentOrganizationSummary, artifactFormatHint: artifactRequest?.format ?? null },
              (delta) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: delta, phase: "primary", responseAuthority: "metrix_main_model" }) + "\n"));
              },
            );
            if (agentRunResult.stopReason !== "completed") {
              console.error("executive_agent_run_failed", {
                requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
                stopReason: agentRunResult.stopReason, errorMessage: agentRunResult.errorMessage,
              });
              // Failure honesty (constitution): kept in sync with the
              // persisted aiContent fallback below — say so live in the
              // stream itself, not only in the record saved after the fact,
              // so the client is never left with a silent connection drop.
              controller.enqueue(encoder.encode(JSON.stringify({
                type: "chunk", content: EXECUTIVE_AGENT_TIMEOUT_MESSAGE, phase: "primary", responseAuthority: "metrix_main_model",
              }) + "\n"));
            }
            console.info("executive_agent_run_complete", {
              requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
              turnCount: agentRunResult.turnCount,
              usage: agentRunResult.usage,
              toolTraces: agentRunResult.toolTraces.map((t) => ({ tool: t.toolName, ms: t.durationMs, status: t.status })),
            });
          }
          for await (const chunk of streamHandle.textStream) {
            if (!loggedFirstUpstreamChunk) {
              loggedFirstUpstreamChunk = true;
              logChatLatency(requestId, requestStartAt, "first_upstream_chunk_received");
              logChatLatency(requestId, requestStartAt, "first_upstream_chunk");
              if (responseReadiness.statusCategory) {
                logChatLatency(requestId, requestStartAt, "status_to_first_real_chunk_ms", {
                  statusCategory: responseReadiness.statusCategory,
                  elapsedMs: Math.round(performance.now() - readinessStartedAt),
                });
              }
            }
            if (!precomputedDeterministicPrimaryMessage) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: chunk, phase: "primary", responseAuthority: "metrix_main_model" }) + "\n"));
            }
            if (!loggedFirstSseChunkSent) {
              loggedFirstSseChunkSent = true;
              // First-token is already enqueued. Only now start heavyweight
              // cognition, without awaiting it, so it can overlap the rest
              // of this same text/voice stream without delaying initial speech.
              startProgressiveIntelligence();
              logChatLatency(requestId, requestStartAt, "first_sse_chunk_sent");
              logChatLatency(requestId, requestStartAt, "first_sse_chunk");
              logChatLatency(requestId, requestStartAt, "server_first_chunk_enqueued");
              logChatLatency(requestId, requestStartAt, "first_client_byte");
              startDeferredInputEffects();
            }
          }

          const finalMeta = await streamHandle.getFinalMeta();
          // The write overlaps the provider stream, but must succeed before a
          // terminal done event so conversation history cannot acknowledge an
          // unpersisted user turn.
          const userMessage = await userMessagePromise;
          startDeferredInputEffects();
          let memoryUpdateCandidates: MemoryCandidateResult = {
            created: [],
            skipped: [],
          };
          logChatLatency(requestId, requestStartAt, "upstream_stream_complete");
          const aiResponse: GenerateAiResponseResult = {
            ...streamHandle.pre,
            content: finalMeta.content,
            model: finalMeta.model,
            provider: finalMeta.provider,
            usage: finalMeta.usage,
            costTracking: buildCostTrackingMetadata(finalMeta.usage),
            rawResponseId: finalMeta.rawResponseId,
          };
          profiler.markEnd("gateway_total");

          profiler.markStart("ai_content_build");
          // Failure honesty (constitution): a run that didn't complete must
          // never persist/surface an empty response as if it were a real
          // answer — that reads to the client as a bare connection error
          // with no explanation. Say plainly that it took too long.
          let aiContent = executiveAgentWillRespond && agentRunResult
            ? (agentRunResult.stopReason === "completed" && agentRunResult.text
              ? agentRunResult.text
              : EXECUTIVE_AGENT_TIMEOUT_MESSAGE)
            : await buildAiContent({
            aiResponse,
            userMessage: message,
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            managerAdviceAugmentationContext,
            executiveBrainContext: executiveBrainShadow,
            executiveConstitutionContext,
            executiveCouncilActivation,
            surface: channel === "voice" ? "voice" : "chat",
            livingBehaviorHint,
            executiveBehaviorPlan,
            executiveManagementPicture,
            executiveAssessment,
            executiveDirective,
            requestId,
            channel,
            capabilityDenialAllowed: businessNavigationResolution.status === "UNAVAILABLE",
            canonicalCustomerResolved: businessNavigationOperationEvidence?.operation === "CUSTOMER_LOOKUP" && businessNavigationOperationEvidence.outcome === "RESOLVED",
            organizationSummary,
            canonicalOperationEvidence,
              });
          // Single Executive Intelligence: whenever a conversation extension already
          // resolved this turn (any domain — customers, tasks, quotes, and any future
          // capability), that handoff is the sole authority for what the assistant says.
          // It always wins over the AI backend's own, independent business-navigation
          // resolution below, which is a second, uncoordinated interpretation of the
          // same utterance and must never be allowed to contradict an already-executed
          // outcome. Domain-specific wording (customers) layers on top of, never
          // instead of, the universal floor every domain gets.
          const deterministicHandoffMessage = precomputedDeterministicHandoffMessage;
          // precomputedBusinessNavigationMessage (computed before the model
          // ever streamed a token, see its own comment above) already is
          // this value — isInformationalCustomerLookup's exclusion applies
          // there too. Reusing it here, instead of recomputing an
          // independent second copy, is what guarantees the primary chunk
          // suppression check above and this final-override check can never
          // disagree with each other.
          const deterministicBusinessNavigationMessage = deterministicHandoffMessage
            ? null
            : precomputedBusinessNavigationMessage;
          // Living Workspace Determinism Operation (Gap 2): neither of the two
          // authorities above produced anything for this turn, yet the turn was
          // still recognized — either explicitly (business-navigation's own
          // MUTATION_SURFACE_RESOLVED evidence for a create-with-Surface domain)
          // or generally (conversation-understanding's existing userMotivation
          // classification, domain-agnostic) — as record-mutation intent. With no
          // handoff at all, nothing confirms a mutation happened; the model must
          // never be left to narrate one on its own. Lowest priority: only
          // applies when neither deterministic authority above already spoke.
          // A workspace-close request is domain-agnostic UI state, not a record
          // mutation — it must never fall into the "couldn't confirm a mutation"
          // fallback below, and it must never get a business-decision rationale
          // appended by progressive enrichment (see the enrichment gate below).
          // Both reuse the precomputed values from before the stream started
          // (same reasoning as deterministicBusinessNavigationMessage above) —
          // recomputing an independent second copy here is exactly what used
          // to let the early suppression gate and this override disagree.
          const deterministicWorkspaceCloseMessage = precomputedWorkspaceCloseMessage;
          const deterministicUnconfirmedMutationMessage = precomputedUnconfirmedMutationMessage;
          // Grand Consolidation Operation: the managementIntent/companyQuery
          // deterministic templates no longer override aiContent here — the
          // ternary above already used the Executive Agent's own text for
          // this turn. Only the genuinely execution-certain fast paths keep
          // final-override priority (same reasoning as
          // precomputedDeterministicPrimaryMessage above).
          if (deterministicHandoffMessage) {
            aiContent = deterministicHandoffMessage;
          } else if (deterministicBusinessNavigationMessage) {
            aiContent = deterministicBusinessNavigationMessage;
          } else if (deterministicWorkspaceCloseMessage) {
            aiContent = deterministicWorkspaceCloseMessage;
          } else if (deterministicUnconfirmedMutationMessage) {
            aiContent = deterministicUnconfirmedMutationMessage;
          }
          // This used to be the point where a second, independent model call
          // ("pipeline C") appended a contradiction-filtered enrichment
          // segment onto the already-streamed primary answer — a competing
          // narration producer, not a single response owner. The METRIX
          // Executive Agent already produced the ONE primary generation
          // above (executiveAgentWillRespond), so there is nothing left to
          // append here. progressiveIntelligencePromise is awaited only so
          // the (retired, now-unavailable) standing executiveBrain shadow
          // metadata and learning-loop result are ready before persistence.
          await progressiveIntelligencePromise;
          profiler.markEnd("ai_content_build");
          const finalizedExecutiveTrace = executiveRuntimeTrace.finalizeResponse(
            aiContent,
            performance.now() - requestStartAt,
          );
          const tracePersistencePromise =
            persistExecutiveRuntimeTraceDeferred(finalizedExecutiveTrace);

          const memoryContextSummary = buildMemoryContextSummary(aiResponse);

          // Send done event before post-stream DB writes so the client can
          // start TTS as soon as the written response is ready.
          controller.enqueue(encoder.encode(
            JSON.stringify({
              type: "done",
              conversationId: conversation.id,
              ai: {
                content: aiContent,
                artifact: agentRunResult?.deliverableArtifact ?? null,
                executiveAssessment: {
                  assessmentId: executiveAssessment.assessmentId,
                  status: executiveAssessment.status,
                  confidence: executiveAssessment.confidence,
                  risks: executiveAssessment.risks,
                  evidence: executiveAssessment.evidence,
                },
                provider: finalMeta.provider,
                model: finalMeta.model,
                memoryContextSummary,
                memoryUpdateCandidates: 0,
                metadata: {
                  learningLoop: learningLoopResult,
                  managerAdvice: {
                    analysis: managerAdviceAnalysis,
                    brief: managerAdviceBrief,
                    responseDraft: managerAdviceResponseDraft,
                    composedResponse: managerAdviceComposedResponse,
                    augmentationContext: managerAdviceAugmentationContext,
                  },
                  executiveBrain: executiveBrainShadow,
                  executiveCognition: cognitionObservation,
                  voiceTransport: channel === "voice" ? {
                    responseAuthority: "canonical_http_pipeline",
                    nativeResponseGeneration: false,
                    ttsInputAuthority: "metrix_main_model_stream",
                  } : null,
                  universalCapture: null,
                },
              },
            }) + "\n",
          ));
          visibleDoneSent = true;
          logChatLatency(requestId, requestStartAt, "done_event_sent");
          logChatLatency(requestId, requestStartAt, "response_done");

          const [
            postStreamIntelligence,
            deferredCaptureActivation,
            deferredMemoryCandidates,
            deferredRealityCandidates,
          ] = await Promise.all([
            progressiveIntelligencePromise,
            capturePromise!,
            memoryCandidatesPromise!,
            realityCandidatesPromise!,
          ]);
          captureActivation = deferredCaptureActivation;
          memoryUpdateCandidates = deferredMemoryCandidates;
          console.info("[BusinessReality] candidate extraction completed", {
            requestId,
            conversationId: conversation.id,
            organizationId: authContext.organization.id,
            candidateIds: deferredRealityCandidates.candidates.map((candidate) => candidate.id),
            candidateChangeCount: deferredRealityCandidates.candidates.reduce(
              (sum, candidate) => sum + candidate.changes.length,
              0,
            ),
            classification: deferredRealityCandidates.classification,
            blockedAiGeneratedCount: deferredRealityCandidates.blockedAiGeneratedCount,
          });
          await tracePersistencePromise;
          await appendExecutiveRuntimeCandidateTrace({
            organizationId: authContext.organization.id,
            requestId,
            candidates: deferredRealityCandidates.candidates,
            blockedAiGeneratedCount:
              deferredRealityCandidates.blockedAiGeneratedCount,
          }).catch((error) => {
            console.warn("executive_runtime_candidate_trace_append_failed", {
              requestId,
              organizationId: authContext.organization.id,
              errorCode: error instanceof Error ? error.name : "UNKNOWN",
            });
          });
          profiler.markStart("operating_context_deferred_writes");
          try {
            await aiResponse.runDeferredOperatingContextWrites?.();
          } catch (error) {
            console.warn("[ExecutiveOperatingContext] Deferred write execution failed:", error);
          }
          profiler.markEnd("operating_context_deferred_writes");

          profiler.markStart("post_ai_writes");
          // Detectors remain proposal evidence only. Raw text/voice turns do
          // not execute lifecycle mutations; any durable status transition
          // must enter Action Runtime with a scoped, persisted approval.
          profiler.markEnd("post_ai_writes");

          profiler.markStart("ai_message_write");
          const conversationTurnArtifacts = buildConversationTurnArtifacts({
            facts: canonicalBusinessFacts,
            sourceMessageId: userMessage.id,
            organizationId: authContext.organization.id,
          });
          const lastSuccessfulOperationContext = buildLastSuccessfulOperationContext(conversationExtensionHandoff, {
            sourceMessageId: userMessage.id,
            organizationId: authContext.organization.id,
          }) ?? previousLastOperationContext;
          await sendAiMessage({
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            content: aiContent,
            metadata: {
              ...buildAiMessageMetadata(
              aiResponse,
              memoryUpdateCandidates.created,
              aiResponse.resolverDecision?.shouldAskNow ? (aiResponse.resolverDecision.targetKey ?? null) : null,
              buildNextRecentlyAskedKeys(
                previousRecentlyAskedKeys,
                aiResponse.resolverDecision?.shouldAskNow ? (aiResponse.resolverDecision.targetKey ?? null) : null,
              ),
              cognitionObservation,
              ),
              executiveBrain:
                postStreamIntelligence?.executiveBrain ?? executiveBrainShadow,
              executiveAssessment: summarizeExecutiveAssessmentForPersistence(
                postStreamIntelligence?.executiveAssessment
                  ?? executiveAssessment,
              ),
              universalCapture: captureActivationMetadata(captureActivation),
              conversationTurnArtifacts,
              lastSuccessfulOperationContext,
              degradedSignals: [...degradedSignals],
            },
          });
          profiler.markEnd("ai_message_write");
          logChatLatency(requestId, requestStartAt, "persistence_completion");

          const newState = aiResponse.conversationState;
          if (newState) {
            if (isNewCommitment(previousConversationState, newState) && newState.committedTitle) {
              try {
                await registerExecutiveDecisionCommitment({
                  organizationId: authContext.organization.id,
                  conversationId: conversation.id,
                  sourceMessageId: userMessage.id,
                  committedTitle: newState.committedTitle,
                  committedAt: newState.committedAt,
                  followUpDueAt: newState.followUpDueAt,
                });
              } catch (error) {
                console.error("[ExecutiveDecisionLoop] Commitment update failed:", error);
              }

              await createMissingMemoryCandidates({
                organizationId: authContext.organization.id,
                createdByUserId: authContext.user.id,
                candidates: [
                  {
                    subjectType: MemorySubjectType.STRATEGY,
                    proposedType: MemoryItemType.STRATEGIC,
                    proposedKey: "son_karar",
                    proposedValue: newState.committedTitle,
                    source: MemoryItemSource.USER_PROVIDED,
                    confidence: 0.92,
                    isAssumption: false,
                    reason: "Kullanici bir eylemi taahhut etti.",
                    sourceMessageId: userMessage.id,
                  },
                ],
              });
            }

            if (isNewOutcome(previousConversationState, newState) && newState.commitmentOutcome && newState.committedTitle) {
              let outcomeMemoryProjection:
                ReturnType<typeof projectExecutiveOutcomeToMemory> = null;
              let resolvedExecutiveOutcome: ExecutiveOutcomeV1 | null = null;
              try {
                resolvedExecutiveOutcome =
                  await registerAndResolveExecutiveDecisionOutcome({
                    organizationId: authContext.organization.id,
                    conversationId: conversation.id,
                    sourceMessageId: userMessage.id,
                    committedTitle: newState.committedTitle,
                    outcome: newState.commitmentOutcome,
                    summary: null,
                    evidenceJson: {
                      previousPhase: previousConversationState?.phase ?? null,
                      currentPhase: newState.phase,
                    },
                    requestId,
                  });
                outcomeMemoryProjection = resolvedExecutiveOutcome
                  ? projectExecutiveOutcomeToMemory(resolvedExecutiveOutcome)
                  : null;
              } catch (error) {
                console.error("[ExecutiveDecisionLoop] Outcome update failed:", error);
              }

              if (outcomeMemoryProjection) {
                await createMissingMemoryCandidates({
                  organizationId: authContext.organization.id,
                  createdByUserId: authContext.user.id,
                  candidates: [
                    {
                      subjectType: MemorySubjectType.PROCESS,
                      proposedType: MemoryItemType.PROCESS,
                      proposedKey: outcomeMemoryProjection.key,
                      proposedValue: outcomeMemoryProjection.value,
                      source: MemoryItemSource.USER_PROVIDED,
                      confidence: outcomeMemoryProjection.confidence,
                      isAssumption: false,
                      reason: "Canonical yönetim sonucu güvenli özete yansıtıldı.",
                      sourceMessageId: userMessage.id,
                    },
                  ],
                });
                console.info("executive_outcome_memory_candidate_created", {
                  requestId,
                  conversationId: conversation.id,
                  organizationId: authContext.organization.id,
                  decisionRecordId: resolvedExecutiveOutcome?.decisionRecordId ?? null,
                  outcomeId: resolvedExecutiveOutcome?.outcomeId ?? null,
                  sourceOutcome: resolvedExecutiveOutcome?.sourceOutcome ?? "UNAVAILABLE",
                  status: resolvedExecutiveOutcome?.status ?? "UNKNOWN",
                  requiresFollowUp:
                    resolvedExecutiveOutcome?.managementImpact.requiresFollowUp ?? true,
                  requiresReagenda:
                    resolvedExecutiveOutcome?.managementImpact.requiresReagenda ?? false,
                  confidence: resolvedExecutiveOutcome?.confidence ?? "LOW",
                  latencyMs: 0,
                  fallbackReason: null,
                });
              }
            }
          }

          profiler.markEnd("route_total");
          profiler.finish();
          logChatLatency(requestId, requestStartAt, "post_response_completion", {
            contextProfile: runtimeResolution.contextProfile,
            readinessMode: responseReadiness.mode,
            requiresExecutiveReasoning,
          });
          controller.close();
        } catch (err: unknown) {
          profiler.markEnd("route_total");
          profiler.finish();
          // The raw exception (name, message, stack) is diagnostic-only and
          // stays server-side, tagged with requestId — it must never reach
          // the SSE payload below, which is the only place a mid-stream
          // failure becomes user-visible. See buildExecutiveFallbackResponse
          // for the one governed, Executive-voiced fallback text every such
          // failure resolves to instead.
          logChatLatency(requestId, requestStartAt, "stream_error", {
            errorName: err instanceof Error ? err.name : typeof err,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          if (!visibleDoneSent) {
            controller.enqueue(encoder.encode(
              JSON.stringify({ type: "error", message: buildExecutiveFallbackResponse("provider_failure") }) + "\n",
            ));
          } else {
            console.warn("[ConversationFirst] post-response work failed:", {
              errorName: err instanceof Error ? err.name : typeof err,
            });
          }
          controller.close();
        }
      },
    });

    // Opening (if enabled — see openingEnabled above) is bridged ahead of
    // the canonical content here, inside the same async lifecycle that
    // produced both, instead of the outer POST function awaiting this
    // IIFE's Response and re-wrapping it a second time. That outer
    // re-wrapping is what previously forced openingEnabled's decision to be
    // made without access to executiveNavigationInput (a different function
    // scope) — collapsing it into one stream construction is what makes the
    // decision and the stream itself share one scope.
    const combinedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (openingHandle) {
          try {
            let firstOpeningChunk = true;
            let openingContent = "";
            for await (const chunk of openingHandle.textStream) {
              if (!chunk) continue;
              openingContent += chunk;
              if (firstOpeningChunk) {
                firstOpeningChunk = false;
                logChatLatency(requestId, requestStartAt, "opening_first_chunk", {
                  segmentMs: Math.round(performance.now() - openingStartedAt),
                });
              }
              controller.enqueue(encoder.encode(JSON.stringify({
                type: "chunk",
                content: chunk,
                phase: "opening",
                responseAuthority: "metrix_main_model",
              }) + "\n"));
            }
            await openingHandle.getFinalMeta();
            if (openingContent.trim()) {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: "chunk",
                content: "\n\n",
                phase: "opening",
                responseAuthority: "metrix_main_model",
              }) + "\n"));
            }
            logChatLatency(requestId, requestStartAt, "opening_done", {
              segmentMs: Math.round(performance.now() - openingStartedAt),
              openingChars: openingContent.length,
            });
          } catch (error) {
            // Opening is latency affordance, never response authority. A
            // provider failure here must not suppress the canonical answer.
            logChatLatency(requestId, requestStartAt, "opening_failed", {
              errorName: error instanceof Error ? error.name : typeof error,
            });
          }
        }

        try {
          const reader = readableStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (error) {
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "error",
            message: buildExecutiveFallbackResponse("provider_failure"),
          }) + "\n"));
          logChatLatency(requestId, requestStartAt, "canonical_stream_bridge_failed", {
            errorName: error instanceof Error ? error.name : typeof error,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(combinedStream, {
      // conversation.id is already known before a single chunk streams,
      // preserving continuity across a barge-in-aborted turn.
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId,
        "X-Conversation-Id": conversation.id,
        "X-Metrix-Response-Authority": "canonical-http-pipeline",
      },
    });
    })();

    return await canonicalResponsePromise;
  } catch (error: unknown) {
    profiler.markEnd("route_total");
    profiler.finish();
    logChatLatency(requestId, requestStartAt, "route_error", {
      errorName: error instanceof Error ? error.name : typeof error,
    });

    console.error("[api/ai/chat][diag] outer_catch", {
      route: "/api/ai/chat",
      stage: "outer_catch",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      stackFirstLine: error instanceof Error ? error.stack?.split("\n")[0] : undefined,
    });

    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    if (error instanceof AiProviderConfigurationError) {
      return fail(error.message, 503);
    }

    if (error instanceof AiProviderRequestError) {
      return fail(error.message, 502);
    }

    return authFail(error);
  }
}

function createMetrixOpeningStream(input: {
  organizationId: string;
  conversationId: string;
  message: string;
  channel: "voice" | "text";
}) {
  const generatedAt = new Date().toISOString();
  const systemPrompt = [
    buildExecutiveIdentityPrompt(),
    buildExecutivePresenceSurfacePolicy({
      surface: input.channel === "voice" ? "voice" : "chat",
    }),
    "AYNI TURUN DİNAMİK AÇILIŞ PARÇASI:",
    "- Bu çağrı bağımsız bir cevap veya ACK değildir; hemen arkasından aynı METRIX turunun kanıta dayalı muhakemesi akacaktır. Bu parça kullanıcıya HEM sesli HEM yazılı olarak anında iletilir, ama nihai kayda hiç girmez — burada söylediğin, ekrandan iz bırakmadan silinip yerini asıl cevaba bırakır. Bu yüzden burada söylenen HER ŞEY gerçekten söylenmeye değer, doğal ve kendi başına anlamlı olmalı; sonradan 'iptal' edilecek bir taslak değil.",
    "- Kullanıcının mesajında somut, adlandırılabilir bir iş konusu veya yönetim alanı VARSA: onu açıkça adlandıran, 3-7 kelimelik tek ve tamamlanmış bir Türkçe cümle üret. Yalnız konuya özgü bir inceleme hareketi söyle. Henüz sonuç, risk türü, tavsiye, olasılık, neden veya hüküm verme; mesajda olmayan isim, rakam veya veri uydurma.",
    "- Kullanıcının sorusu güncel/harici bir gerçeğe bağlıysa (döviz kuru, hava durumu, mesafe/süre/rota, trafik, bir mekanın açık olup olmadığı, güncel haber/şirket gelişmesi gibi — canlı kanıt gerektiren, henüz sana verilmemiş herhangi bir dış dünya bilgisi): somut bir DEĞER, sayı, oran, süre, durum veya sonuç ASLA üretme — bunlar henüz alınmadı, uydurman kesinlikle yasak. Yalnızca konuyu/eylemi adlandır (ör. 'Güncel kuru kontrol ediyorum.', 'Rotayı ve güncel yol bilgisini kontrol ediyorum.', 'Hava durumuna bakıyorum.', 'Şirketle ilgili güncel kaynaklara bakıyorum.'). 'Yaklaşık 4 saat sürer.', 'Dolar 48 TL civarında.', 'Yarın yağmur bekleniyor.', 'Şu anda açık görünüyor.' gibi belirli bir değer içeren cümleler, konu doğru olsa bile buradan asla çıkmamalı — gerçek değer yalnız kanıta dayalı asıl cevapta gelir.",
    "- Kullanıcının mesajında somut bir iş konusu YOKSA (selamlama, hâl hatır sorma, teşekkür, günlük sohbet gibi): HİÇBİR ŞEY üretme, tamamen boş çıktı ver. Bu durumu asla kullanıcının tonunu/niyetini/duygusunu betimleyen bir cümleyle ('sıcak bir selam verdi', 'samimi karşılık veriyorum' gibi) doldurma — bu, kendi iç muhakemeni kullanıcıya anlatmak olur, kesinlikle yasak. Konu yoksa sessizlik en doğru cevaptır; asıl cevap zaten hemen arkasından gelecek.",
    "- Kullanıcı METRIX'in kendisiyle ilgili bir şey sorduysa (kim olduğun, ne iş yaptığın, kendini tanıtman, 'nasılsın' gibi hâl hatır dahil): bu da somut bir iş konusu DEĞİLDİR, yukarıdaki 'konu yok' kuralı geçerlidir — HİÇBİR ŞEY üretme. Kendini tanıtmak veya hâl hatıra cevap vermek yalnız hemen arkadan gelecek asıl cevabın işidir; bu açılış parçası bunu asla önceden yapmaya çalışmamalı.",
    "- Sabit bir cümle listesinden seçme. 'Tabii', 'elbette', 'hemen bakıyorum', 'yardımcı olayım' gibi jenerik hizmet kalıplarını kullanma.",
    "- Soruyu yanıtlamaya, tavsiye vermeye veya turu kapatmaya çalışma. Yalnızca doğal açılış cümlesini üret ve noktalama işaretiyle bitir (ya da yukarıdaki kural gereği hiç üretme).",
    "- Markdown, başlık, tırnak ve açıklama kullanma.",
  ].join("\n");

  return createOpenAiStream({
    systemPrompt,
    userMessage: input.message,
    context: {
      version: "v1",
      generatedAt,
      organizationId: input.organizationId,
      totalIncluded: 0,
      facts: [],
      processes: [],
      strategic: [],
      preferences: [],
      highlights: [],
      conflicts: [],
    },
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
  }, {
    maxOutputTokens: 48,
    temperature: 0.3,
  });
}

function readChatMessage(body: RequestBody): string {
  const message = requiredString(body, "message").trim();

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ApiValidationError("message is too long.");
  }

  return message;
}

function assertNoForbiddenClientFields(body: RequestBody): void {
  const forbiddenField = FORBIDDEN_CLIENT_FIELDS.find(
    (field) => body[field] !== undefined,
  );

  if (forbiddenField) {
    throw new ApiValidationError(`${forbiddenField} is not accepted.`);
  }
}

function buildAmbiguousEntityClarificationMessage(candidateNames: readonly string[]): string {
  const list = candidateNames.length === 1
    ? candidateNames[0]
    : `${candidateNames.slice(0, -1).join(", ")} ve ${candidateNames[candidateNames.length - 1]}`;
  return `Bu isimle eşleşen birden fazla kayıtlı müşteri var: ${list}. Bunlardan birini mi kastediyorsunuz, yoksa yeni bir müşteri kaydı mı açalım?`;
}

function customerFieldLabel(key: string): string {
  return CUSTOMER_BUILT_IN_FIELDS.find((field) => field.key === key)?.label ?? key;
}

function buildCustomerCreateHandoffMessage(handoff: ConversationExtensionHandoff | null): string | null {
  if (!handoff || handoff.domain !== "customers") return null;
  if (handoff.operation === "ATTACHMENT") {
    if (handoff.outcomeCode === "ATTACHMENT_NOTIFY_AMBIGUOUS" && handoff.candidateNames.length) {
      return `Hangi kişiyi kastediyorsunuz: ${handoff.candidateNames.join(" mı, ")} mı?`;
    }
    if (handoff.outcomeCode === "ATTACHMENT_NOTIFY_TARGET_REQUIRED") return "Kime göndermemi istersiniz? Lütfen kişinin adını belirtin.";
    if (handoff.outcomeCode === "ATTACHMENT_NOTIFY_DELIVERED") return handoff.candidateNames[0] ? `Belge bildirimini ${handoff.candidateNames[0]} adlı kullanıcıya gönderdim.` : "Belge bildirimini ilgili kullanıcıya gönderdim.";
  }
  if (handoff.operation === "UPDATE") return buildCustomerEditHandoffMessage(handoff);
  // A pending-create-draft status observation (coordinator's STATUS_QUERY
  // branch, customer-create-conversation-coordinator.ts) reports operation
  // "QUERY", not "CREATE" — the operation!==CREATE short-circuit below would
  // otherwise return null here, leaving this turn's narration to raw
  // free-text with no mutation/persistence evidence behind it. Production
  // regression: a real-account continuation turn ("evet var") resolved to
  // this exact STATUS_QUERY plan and the free-text fallback fabricated
  // "...bilgileri sisteme kaydedildi" with zero create-action network call —
  // independently disproven via GET /api/customers. Ground this turn
  // deterministically instead, same principle as CREATE_DRAFT_READY below.
  if (handoff.operation === "QUERY" && handoff.outcomeCode === "CREATE_WORKFLOW_STATUS") {
    if (!handoff.fieldNames.length) return "Taslak henüz boş; devam etmek için müşteri bilgilerini paylaşabilirsiniz.";
    const labels = handoff.fieldNames.map(customerFieldLabel);
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} ve ${labels[labels.length - 1]}`;
    return `Taslakta şu an ${list} bilgisi var, henüz kaydedilmedi. Kaydetmek için "kaydet" diyebilirsiniz.`;
  }
  if (handoff.operation !== "CREATE") return null;
  if (handoff.outcomeCode === "CREATE_NOTIFICATION_TARGET_CLARIFICATION_REQUIRED") {
    return handoff.candidateNames.length
      ? `Bildirim için birden fazla eşleşme buldum: ${handoff.candidateNames.join(", ")}. Hangisini kastediyorsunuz?`
      : "Bildirimi kime göndereceğimi netleştirir misiniz? Lütfen kişinin adını belirtin.";
  }
  if (handoff.outcomeCode === "CREATE_NOTIFICATION_TARGET_DELIVERED") {
    return handoff.candidateNames[0] ? `Ek bildirimi ${handoff.candidateNames[0]} adlı kullanıcıya gönderdim.` : "Ek bildirimi ilgili kullanıcıya gönderdim.";
  }
  if (handoff.resultStatus === "CLARIFICATION_REQUIRED" && handoff.entityResolution === "AMBIGUOUS" && handoff.candidateNames.length > 0) {
    return buildAmbiguousEntityClarificationMessage(handoff.candidateNames);
  }
  if (handoff.outcomeCode === "CREATE_DISPLAY_NAME_REQUIRED") {
    return "Kaydı açabilmem için önce firma adını paylaşır mısınız?";
  }
  if (handoff.resultStatus === "EXECUTED" && handoff.outcomeCode === "CREATE_DRAFT_READY") {
    if (!handoff.fieldNames.length) return "Yeni müşteri taslağını açtım. Devam etmek için müşteri bilgilerini paylaşabilirsiniz.";
    const labels = handoff.fieldNames.map(customerFieldLabel);
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} ve ${labels[labels.length - 1]}`;
    return `${list} bilgisini taslağa işledim. Devam etmek için başka bilgi paylaşabilir veya "kaydet" diyerek tamamlayabilirsiniz.`;
  }
  if (handoff.resultStatus === "EXECUTED" && handoff.outcomeCode === "CREATE_COMMITTED" && handoff.mutationPerformed) {
    return "Müşteri kaydını oluşturdum.";
  }
  return null;
}

function buildCustomerEditHandoffMessage(handoff: ConversationExtensionHandoff): string | null {
  if (handoff.outcomeCode === "CUSTOMER_EDIT_CLARIFICATION_REQUIRED") {
    return "Bu değişikliği hangi alana uygulayacağımı netleştirir misiniz?";
  }
  if (handoff.outcomeCode === "CUSTOMER_EDIT_FAILED") {
    return "Bu değişikliği uygulayamadım. Tekrar dener misiniz?";
  }
  if (handoff.resultStatus === "EXECUTED" && handoff.outcomeCode === "CUSTOMER_EDIT_COMMITTED") {
    return "Değişiklikleri kaydettim.";
  }
  if (handoff.resultStatus === "EXECUTED" && handoff.outcomeCode === "CUSTOMER_EDIT_EXECUTED") {
    if (!handoff.fieldNames.length) return "Değişikliği uyguladım.";
    const labels = handoff.fieldNames.map(customerFieldLabel);
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} ve ${labels[labels.length - 1]}`;
    return `${list} bilgisini güncelledim.`;
  }
  return null;
}

// The raw evidence is JSON.stringify'd straight into the prompt — cap any
// unbounded record-name list before that happens, or the model sees every
// name in context regardless of what the surrounding instruction says.
function buildPromptSafeNavigationEvidence(evidence: BusinessNavigationOperationEvidence): BusinessNavigationOperationEvidence {
  if (evidence.operation !== "CUSTOMER_LIST" && evidence.operation !== "DOMAIN_LIST") return evidence;
  const { sample } = sampleRecordNamesForNarration(evidence.recordNames);
  return { ...evidence, recordNames: sample };
}

function buildCustomerListSampleInstruction(evidence: Extract<BusinessNavigationOperationEvidence, { operation: "CUSTOMER_LIST" }>): string {
  const { sample, remainingCount } = sampleRecordNamesForNarration(evidence.recordNames);
  const sampleClause = `A representative sample of the customer names you may mention when answering this turn, already read from the canonical repository (these are real, provided data — using them is not fabrication): ${sample.join(", ")}.`;
  if (remainingCount === 0) return sampleClause;
  return `${sampleClause} There are ${remainingCount} more customers not listed here — do not claim this sample is the complete list and never read out every name one by one, especially in a spoken answer. State the real total (${evidence.recordCount}), mention a few names from the sample, and point to the open screen for the rest.`;
}

// Generic counterpart to buildCustomerListSampleInstruction above, covering
// every other listable domain (stock, orders, invoices, payments,
// suppliers, products, tasks) through one shared shape — see
// listable-domain-registry.ts. This is the grounding that prevents a
// free-form status question ("stok var mı") from getting an ungrounded,
// possibly contradicting model answer when no conversation-extension regex
// matched the exact phrasing.
function buildDomainListEvidenceInstruction(evidence: Extract<BusinessNavigationOperationEvidence, { operation: "DOMAIN_LIST" }>): string {
  const label = LISTABLE_DOMAIN_LABELS[evidence.domain];
  if (evidence.recordCount === 0) {
    return `The canonical ${evidence.domain} repository is empty for this organization — say plainly that there are no ${label.toLowerCase()} records yet, do not say you lack access or that the data is unavailable.`;
  }
  const { sample, remainingCount } = sampleRecordNamesForNarration(evidence.recordNames);
  const sampleClause = `A representative sample of real ${label.toLowerCase()} records for this turn, already read from the canonical repository (these are real, provided data — using them is not fabrication, and the real total is ${evidence.recordCount}): ${sample.join(", ")}.`;
  if (remainingCount === 0) return sampleClause;
  return `${sampleClause} There are ${remainingCount} more not listed here — do not claim this sample is the complete list and never read out every one, especially in a spoken answer. State the real total (${evidence.recordCount}), mention a few from the sample, and point to the open screen for the rest.`;
}

function buildBusinessNavigationMessage(evidence: BusinessNavigationOperationEvidence | null, calendarClock?: CalendarClock): string | null {
  if (!evidence) return null;
  if (evidence.operation === "CALENDAR_OPEN") return buildCalendarNavigationMessage(evidence, calendarClock ?? createCalendarClock(new Date()));
  if (evidence.operation === "CUSTOMER_LIST") {
    if (evidence.recordNames.length === 0) return "Şirketinizde henüz kayıtlı bir müşteri bulunmuyor.";
    const { sample, remainingCount } = sampleRecordNamesForNarration(evidence.recordNames);
    const sampleText = sample.join(", ");
    return remainingCount > 0
      ? `Şirketinizde kayıtlı ${evidence.recordCount} müşteri var. İlk birkaçı: ${sampleText} — ve ${remainingCount} kişi daha. Tam listeyi ekranda görebilirsin.`
      : `Şirketinizde kayıtlı ${evidence.recordCount} müşteri var: ${sampleText}.`;
  }
  if (evidence.operation === "DOMAIN_LIST") {
    const label = LISTABLE_DOMAIN_LABELS[evidence.domain];
    if (evidence.recordNames.length === 0) return `Şirketinizde henüz kayıtlı bir ${label.toLowerCase()} bulunmuyor.`;
    const { sample, remainingCount } = sampleRecordNamesForNarration(evidence.recordNames);
    const sampleText = sample.join(", ");
    return remainingCount > 0
      ? `Sistemde kayıtlı ${evidence.recordCount} ${label.toLowerCase()} var. İlk birkaçı: ${sampleText} — ve ${remainingCount} tane daha. Tam listeyi ekranda görebilirsin.`
      : `Sistemde kayıtlı ${evidence.recordCount} ${label.toLowerCase()} var: ${sampleText}.`;
  }
  if (evidence.operation !== "CUSTOMER_LOOKUP") return null;
  if (evidence.outcome === "RESOLVED") return "İlgili müşteri kaydını açtım.";
  if (evidence.outcome === "NOT_FOUND") {
    return evidence.createProposalAllowed
      ? "Bu isimle kayıtlı bir müşteri bulamadım. Yeni bir müşteri kaydı oluşturmamı ister misiniz?"
      : "Bu isimle kayıtlı bir müşteri bulamadım.";
  }
  if (evidence.outcome === "AMBIGUOUS") return "Bu isimle eşleşen birden fazla müşteri var. Hangisini kastettiğinizi belirtir misiniz?";
  return null;
}

function buildAiContent(input: {
  aiResponse: GenerateAiResponseResult;
  userMessage: string;
  organizationId: string;
  conversationId: string;
  managerAdviceAugmentationContext: ManagerAdviceAugmentationContext | null;
  executiveBrainContext: ExecutiveBrainShadowMetadata;
  executiveConstitutionContext: ExecutiveConstitutionContext;
  executiveCouncilActivation: ExecutiveCouncilActivation;
  surface: "chat" | "voice";
  livingBehaviorHint: LivingExecutiveSemanticHint | null;
  executiveBehaviorPlan: ExecutiveBehaviorPlanV1;
  executiveManagementPicture: ExecutiveManagementPictureV1;
  executiveAssessment: ExecutiveAssessmentV1;
  executiveDirective: ExecutiveDirectiveV1;
  requestId: string;
  channel: "voice" | "text";
  capabilityDenialAllowed: boolean;
  canonicalCustomerResolved: boolean;
  organizationSummary: string;
  canonicalOperationEvidence: string | null;
}): Promise<string> {
  const sanitization = sanitizeExecutiveManagerResponse({
    content: input.aiResponse.content,
    userMessage: input.userMessage,
    surface: input.surface,
    semanticHint: input.livingBehaviorHint,
    capabilityDenialAllowed: input.capabilityDenialAllowed,
    canonicalCustomerResolved: input.canonicalCustomerResolved,
  });

  if (!sanitization.needsRepair) {
    console.info("executive_response_sanitization_passed", {
      requestId: input.requestId,
      channel: input.channel,
      primaryBehavior: input.executiveBehaviorPlan.primaryBehavior,
      interactionPosture: input.executiveBehaviorPlan.interactionPosture,
      questionPolicy: input.executiveBehaviorPlan.questionPolicy,
      challengePolicy: input.executiveBehaviorPlan.challengePolicy,
      pacingIntent: input.executiveBehaviorPlan.pacingIntent,
      requiresExecutiveReasoning: input.executiveBehaviorPlan.requiresExecutiveReasoning,
    });
    return Promise.resolve(sanitization.content);
  }

  console.info("executive_response_repair_started", {
    requestId: input.requestId,
    channel: input.channel,
    primaryBehavior: input.executiveBehaviorPlan.primaryBehavior,
    interactionPosture: input.executiveBehaviorPlan.interactionPosture,
    questionPolicy: input.executiveBehaviorPlan.questionPolicy,
    challengePolicy: input.executiveBehaviorPlan.challengePolicy,
    pacingIntent: input.executiveBehaviorPlan.pacingIntent,
    requiresExecutiveReasoning: input.executiveBehaviorPlan.requiresExecutiveReasoning,
    repairReason: sanitization.reason,
  });
  if (input.aiResponse.provider === "mock") {
    console.warn("executive_response_repair_failed", {
      requestId: input.requestId,
      channel: input.channel,
      repairReason: sanitization.reason,
      failure: "mock_provider",
    });
    return Promise.resolve(buildTechnicalRepairUnavailableMessage());
  }

  return repairAiContent(input, sanitization.reason).catch((error) => {
    console.warn("executive_response_repair_failed", {
      requestId: input.requestId,
      channel: input.channel,
      primaryBehavior: input.executiveBehaviorPlan.primaryBehavior,
      repairReason: sanitization.reason,
      failure: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  });
}

async function repairAiContent(
  input: {
    aiResponse: GenerateAiResponseResult;
    userMessage: string;
    organizationId: string;
    conversationId: string;
    managerAdviceAugmentationContext: ManagerAdviceAugmentationContext | null;
    executiveBrainContext: ExecutiveBrainShadowMetadata;
    executiveConstitutionContext: ExecutiveConstitutionContext;
    executiveCouncilActivation: ExecutiveCouncilActivation;
    surface: "chat" | "voice";
    livingBehaviorHint: LivingExecutiveSemanticHint | null;
    executiveBehaviorPlan: ExecutiveBehaviorPlanV1;
    executiveManagementPicture: ExecutiveManagementPictureV1;
    executiveAssessment: ExecutiveAssessmentV1;
    executiveDirective: ExecutiveDirectiveV1;
    requestId: string;
    channel: "voice" | "text";
    capabilityDenialAllowed: boolean;
    canonicalCustomerResolved: boolean;
    organizationSummary: string;
    canonicalOperationEvidence: string | null;
  },
  reason: string,
): Promise<string> {
  const repairedResponse = await generateAiResponse({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    provider: input.aiResponse.provider,
    behaviorSurface: "repair",
    organizationSummary: input.organizationSummary,
    canonicalOperationEvidence: input.canonicalOperationEvidence,
    livingBehaviorHint: input.livingBehaviorHint,
    executiveBehaviorPlan: input.executiveBehaviorPlan,
    executiveManagementPicture: input.executiveManagementPicture,
    executiveAssessment: input.executiveAssessment,
    executiveDirective: input.executiveDirective,
    userMessage: buildExecutiveRepairUserMessage({
      originalUserMessage: input.userMessage,
      rejectedContent: input.aiResponse.content,
      reason,
    }),
    managerAdviceAugmentationContext: input.managerAdviceAugmentationContext,
    executiveBrainContext: input.executiveBrainContext,
    executiveConstitutionContext: input.executiveConstitutionContext,
    executiveCouncilActivation: input.executiveCouncilActivation,
  });
  const repairedSanitization = sanitizeExecutiveManagerResponse({
    content: repairedResponse.content,
    userMessage: input.userMessage,
    surface: input.surface,
    semanticHint: input.livingBehaviorHint,
    capabilityDenialAllowed: input.capabilityDenialAllowed,
    canonicalCustomerResolved: input.canonicalCustomerResolved,
  });

  if (!repairedSanitization.needsRepair) {
    console.info("executive_response_repair_completed", {
      requestId: input.requestId,
      channel: input.channel,
      primaryBehavior: input.executiveBehaviorPlan.primaryBehavior,
      repairReason: reason,
    });
    return repairedSanitization.content;
  }

  throw new AiProviderRequestError("AI response repair failed.");
}

function buildExecutiveRepairUserMessage(input: {
  originalUserMessage: string;
  rejectedContent: string;
  reason: string;
}): string {
  const repairProfile = resolveLivingExecutiveBehavior({
    userMessage: input.originalUserMessage,
    surface: "repair",
    hasPriorTurns: true,
  });
  const repairGuidance = getLivingRepairInstruction(input.reason);
  return [
    buildExecutivePresenceSurfacePolicy({ surface: "repair" }),
    projectLivingBehaviorPrompt(repairProfile),
    ...(repairGuidance ? [repairGuidance] : []),
    "Kullanicinin asil mesajina dogrudan, dogal Turkceyle yeniden cevap ver.",
    "Dahili sistem, hafiza, metadata, kategori, guven, kaynak veya teknik kontrol dilini anlatma.",
    "Hazir kalip kullanma; kullanicinin mesajina uygun, kisa ve insani bir AI Genel Mudur cevabi uret.",
    "",
    "Kullanicinin asil mesaji:",
    input.originalUserMessage,
    "",
    "Reddedilen cevap:",
    input.rejectedContent,
  ].join("\n");
}

function getLivingRepairInstruction(reason: string): string | null {
  if (reason === "absolute_capability_denial") {
    return "Bu reddedilen cevap, gerçekte var olan bir yetki/erişim/bağlantı eksikliği olmadan mutlak bir 'yapamam' ifadesi kurmuştu. Müşteri, görev ve diğer canonical işlemler için gerçek mutation yetkisi ve bağlantısı her zaman mevcuttur. Eğer runtime evidence içinde entityResolution AMBIGUOUS ise, candidateNames listesindeki kayıtları kullanıcıya adıyla söyle ve hangisini kastettiğini veya yeni kayıt açmak isteyip istemediğini sor. Asla yetkim/erişimim/bağlantım yok, mevcut değil veya bulunmuyor gibi ifadeler kullanma.";
  }
  if (reason === "absolute_context_denial") {
    return "Bu reddedilen cevap, elindeki gerçek veriyi yok sayarak mutlak bir bilgi eksikliği iddia etmişti. Sana sağlanan runtime evidence ve şirket özetindeki gerçek veriyi kullanarak doğal ve doğru bir cevap üret.";
  }
  const livingReasons: readonly LivingBehaviorViolation[] = [
    "generic_assistant_register", "external_advisor_register", "casual_forced_to_business",
    "self_identity_lost", "capability_absolute_denial", "capability_unbounded_claim",
    "repair_mechanism_exposed", "voice_report_format", "unnecessary_identity_repetition",
  ];
  return livingReasons.includes(reason as LivingBehaviorViolation)
    ? buildLivingRepairGuidance(reason as LivingBehaviorViolation).instruction
    : null;
}

function buildAiMessageMetadata(
  aiResponse: GenerateAiResponseResult,
  memoryCandidates: MemoryCandidate[],
  learningTargetKey: string | null = null,
  learningRecentlyAskedKeys: string[] = [],
  executiveCognition: ChatExecutiveCognitionObservation | null = null,
): Prisma.InputJsonObject {
  return {
    provider: aiResponse.provider,
    model: aiResponse.model,
    promptTemplate: aiResponse.promptTemplate,
    memoryContextSummary: buildMemoryContextSummary(aiResponse),
    memoryUpdateCandidates: memoryCandidates.map((candidate) => ({
      id: candidate.id,
      key: candidate.proposedKey,
      proposedValue: candidate.proposedValue,
    })),
    usage: aiResponse.usage ?? null,
    costTracking: aiResponse.costTracking ?? null,
    rawResponseId: aiResponse.rawResponseId ?? null,
    conversationState: aiResponse.conversationState ?? null,
    learningTargetKey,
    learningRecentlyAskedKeys,
    executiveCognition,
  };
}

function extractRecentlyAskedKeys(metadata: unknown): string[] {
  try {
    if (!metadata || typeof metadata !== "object") return [];
    const raw = metadata as Record<string, unknown>;
    const keys = raw["learningRecentlyAskedKeys"];
    if (!Array.isArray(keys)) return [];
    return keys.filter((k): k is string => typeof k === "string");
  } catch (error) {
    console.warn("[ConversationState] recentlyAskedKeys parse failed:", error);
    return [];
  }
}

function extractDegradedSignals(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).degradedSignals;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function extractExecutiveDecisionCalibration(
  metadata: unknown,
): ExecutiveDecisionCalibrationV1 | null {
  if (!metadata || typeof metadata !== "object") return null;
  const executiveBrain = (metadata as Record<string, unknown>).executiveBrain;
  if (!executiveBrain || typeof executiveBrain !== "object") return null;
  const decisionPackage = (executiveBrain as Record<string, unknown>).decisionPackage;
  if (!decisionPackage || typeof decisionPackage !== "object") return null;

  const projectDecision = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const decision = value as Record<string, unknown>;
    if (
      typeof decision.category !== "string"
      || typeof decision.priority !== "string"
      || typeof decision.confidence !== "number"
      || !Number.isFinite(decision.confidence)
    ) return null;
    return Object.freeze({
      category: decision.category,
      priority: decision.priority,
      confidence: decision.confidence,
    });
  };

  const rawPackage = decisionPackage as Record<string, unknown>;
  const primaryDecision = projectDecision(rawPackage.primaryDecision);
  if (!primaryDecision) return null;
  const supportingDecisions = Array.isArray(rawPackage.supportingDecisions)
    ? rawPackage.supportingDecisions
        .map(projectDecision)
        .filter((decision): decision is NonNullable<typeof decision> => decision !== null)
    : [];

  return Object.freeze({
    primaryDecision,
    supportingDecisions: Object.freeze(supportingDecisions),
  });
}

function buildNextRecentlyAskedKeys(
  existing: string[],
  newKey: string | null,
  windowSize = 3,
): string[] {
  if (!newKey) return existing;
  if (existing.includes(newKey)) return existing;
  return [...existing, newKey].slice(-windowSize);
}

function buildMemoryContextSummary(
  aiResponse: GenerateAiResponseResult,
): Prisma.InputJsonObject {
  const memoryContext = aiResponse.memoryContext;

  return {
    version: memoryContext.version,
    totalIncluded: memoryContext.totalIncluded,
    highlights: memoryContext.highlights.length,
    facts: memoryContext.facts.length,
    processes: memoryContext.processes.length,
    strategic: memoryContext.strategic.length,
    preferences: memoryContext.preferences.length,
    conflicts: memoryContext.conflicts.length,
  };
}

// Grand Consolidation Operation: this used to build an org-wide standing
// brief (Council -> Strategic Profile -> Decision Package -> GM Brief) as
// post-stream "shadow" metadata — real, independent judgment-generating
// calls, never shown to the user but still a second cognition owner (rule
// 24: "operasyon sonunda ikinci General Manager cognition owner kalamaz").
// Retired entirely, not merely bypassed: no council/strategic-profile/
// decision-package/brief call runs anymore, from any code path. The
// executiveAssessment field is kept (it is deterministic calibration data,
// not LLM judgment — see executiveDirective/executiveBehaviorPlan's own
// classification) so callers expecting that shape are unaffected.
async function buildExecutiveBrainShadowMetadata(input: {
  organizationId?: string | null;
  organization?: Organization;
  activeMemoryItems?: MemoryItemResult[];
  requestId: string;
  requestStartAt: number;
  conversationId: string;
  channel: "voice" | "text";
  profiler: RequestProfiler;
  picture: ExecutiveManagementPictureV1;
  internalAssessment: ReturnType<typeof buildExecutiveAssessmentFromManagementPicture>["internalAssessment"];
  canonicalAssessment: ExecutiveAssessmentV1;
}): Promise<ExecutiveBrainPostStreamResult> {
  return {
    executiveBrain: {
      mode: "unavailable",
      generatedAt: input.picture.generatedAt,
      reason: "Retired: judgment is now owned exclusively by the METRIX Executive Agent.",
    },
    executiveAssessment: input.canonicalAssessment,
  };
}

function safeExecutiveBrainStageError(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  return /^[A-Za-z][A-Za-z0-9]*Error$/u.test(error.name) ? error.name : "EXECUTIVE_BRAIN_STAGE_FAILED";
}

function summarizeExecutiveAssessmentForPersistence(
  assessment: ExecutiveAssessmentV1,
): Prisma.InputJsonObject {
  return {
    schemaVersion: assessment.schemaVersion,
    assessmentId: assessment.assessmentId,
    source: assessment.source,
    status: assessment.status,
    riskCount: assessment.risks.length,
    opportunityCount: assessment.opportunities.length,
    decisionFactorCount: assessment.decisionFactors.length,
    evidenceGapCount: assessment.evidenceGaps.length,
    confidence: assessment.confidence,
    generatedAt: assessment.generatedAt,
  };
}
