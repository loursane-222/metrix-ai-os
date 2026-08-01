import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { streamWithAiGateway } from "@/lib/ai/gateway/ai-gateway";
import type { AiGatewayStreamHandle } from "@/lib/ai/gateway/ai-gateway";
import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
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
import { findLastAiMessageByConversation } from "@/lib/core/conversations/conversation.repository";
import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";
import { buildAIGeneralManagerBrief } from "@/lib/executive-brain/ai-general-manager-brief.service";
import { buildExecutiveCouncil } from "@/lib/executive-brain/executive-council.service";
import { buildExecutiveDecisionPackage } from "@/lib/executive-brain/executive-decision-engine.service";
import { buildStrategicProfile } from "@/lib/executive-brain/strategic-profile.service";
import {
  buildExecutiveAssessmentFromManagementPicture,
  managementPictureToInternalContext,
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
import { buildExecutivePresenceSurfacePolicy } from "@/lib/ai/identity/executive-identity-prompt";
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
  ExecutiveCouncil,
  ExecutiveBrainShadowMetadata,
} from "@/lib/executive-brain/executive-brain.types";
import type {
  ExecutiveConstitutionContext,
  ExecutiveCouncilActivation,
} from "@/lib/executive-constitution/executive-constitution.types";
import type { ManagerAdviceAugmentationContext } from "@/lib/manager-advice/manager-advice-augmentation.types";
import { isNewCommitment, isNewOutcome } from "@/lib/executive-conversation/executive-commitment-engine.service";
import {
  buildChatExecutiveCognitionObservation,
  resolveChatExecutiveCognition,
} from "@/lib/ai/chat-executive-intelligence.adapter";
import {
  classifyConversation,
  resolveConversationRuntime,
  resolveTextResponseReadiness,
  tryFastPathClassification,
} from "@/lib/conversation-understanding";
import { createRequestProfiler, type RequestProfiler } from "@/lib/ai/performance/request-profiler";
import {
  createShadowExecutiveRequestResolver,
  observeShadowExecutiveRequestResolution,
  projectBusinessNavigation,
  projectBusinessNavigationOperationEvidence,
  resolveBusinessNavigation,
} from "@/lib/executive-request-resolution";
import { prisma } from "@/lib/core/shared/prisma";
import { buildMemoryContextFromItems } from "@/lib/memory/memory-context-builder.service";
import { USER_MESSAGE_CREATED } from "@/lib/core/events/event-names";
import { randomUUID } from "crypto";
import { captureActivationMetadata, captureLiveCustomerConversation } from "@/lib/customers/customer-live-capture.service";
import {
  extractAndPersistBusinessCandidates,
  generateBusinessRealityExtractionText,
} from "@/lib/business-reality-candidates";
import { validateConversationExtensionHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";
import { emitCustomerLifecycle } from "@/lib/conversation-extensions/conversation-lifecycle-telemetry";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "@/lib/conversation-extensions/business-navigation-telemetry";
import { completeFirstExperienceAfterNormalTurn } from "@/lib/first-experience/first-experience.service";
import {
  buildTechnicalRepairUnavailableMessage,
  extractConversationState,
  logChatLatency,
  registerChatTimelineContext,
} from "./chat-shared";

type ExecutiveBrainPostStreamResult = Readonly<{
  executiveBrain: ExecutiveBrainShadowMetadata;
  executiveAssessment: ExecutiveAssessmentV1;
}>;

const MAX_MESSAGE_LENGTH = 4000;
const shadowResolver = createShadowExecutiveRequestResolver();
const FORBIDDEN_CLIENT_FIELDS = [
  "organizationId",
  "userId",
  "actorUserId",
  "provider",
  "promptTemplateId",
] as const;

const CHAT_RATE_LIMIT_MAX_MESSAGES = 20;
const CHAT_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

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
    logChatLatency(requestId, requestStartAt, "body_parsed");

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
    const classifyPromise = fastPathResult.matched
      ? Promise.resolve(fastPathResult.understanding)
      : classifyConversation({ message });
    const conversationId = optionalString(body, "conversationId");

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
      listCustomers: async () => conversationUnderstanding.businessNavigation?.domain === "customer"
        ? prisma.customer.findMany({
            where: { organizationId: authContext.organization.id },
            select: { id: true, displayName: true, legalName: true, phone: true, email: true, cariKodu: true, taxNumber: true },
            take: 50,
          })
        : [],
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
    const extensionNavigationCompleted = conversationExtensionHandoff?.operation === "CREATE"
      && conversationExtensionHandoff.navigationRequested
      && conversationExtensionHandoff.navigationStatus === "COMPLETED";
    const executiveNavigationInput = businessNavigationResolution.status === "RESOLVED" && !extensionNavigationCompleted
      ? projectBusinessNavigation(businessNavigationResolution.descriptor)
      : null;
    const businessNavigationOperationEvidence = projectBusinessNavigationOperationEvidence(businessNavigationResolution);
    emitBusinessNavigationTelemetry("BusinessNavigation", {
      event: "projection_completed", correlationId, descriptorKind,
      routeType: executiveNavigationInput ? businessNavigationRouteType(executiveNavigationInput.route) : null,
      expectedSurfaceAuthorityKey: executiveNavigationInput?.expectedSurfaceAuthorityKey ?? null,
      projectionStatus: executiveNavigationInput ? "PROJECTED" : "SKIPPED",
    });
    logChatLatency(requestId, requestStartAt, "classification_done", {
      fastPath: fastPathResult.matched,
      classificationMode: fastPathResult.matched ? "deterministic" : "provider",
      contextProfile: runtimeResolution.contextProfile,
      segmentMs: Math.round(performance.now() - classificationStartedAt),
    });
    void observeShadowExecutiveRequestResolution({
      requestId,
      channel,
      organizationId: authContext.organization.id,
      understanding: conversationUnderstanding,
      resolver: shadowResolver,
    });
    const requiresExecutiveReasoning = conversationUnderstanding.shouldInvokeExecutiveBrain;
    const pictureStartedAt = performance.now();
    console.info("executive_management_picture_start", {
      requestId, conversationId: conversation.id, organizationId: authContext.organization.id,
    });
    const executiveManagementPicture = await buildExecutiveManagementPictureV1({
      organizationId: authContext.organization.id,
      conversationId: conversation.id,
      requestId,
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
    const directiveStartedAt = performance.now();
    const executiveDirective = resolveExecutiveDirective({
      understanding: conversationUnderstanding,
      assessment: executiveAssessment,
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

    profiler.markStart("last_message_fetch");
    const lastMessageStartedAt = performance.now();
    const lastAiMessage = conversationId
      ? await findLastAiMessageByConversation(conversation.id)
      : null;
    profiler.markEnd("last_message_fetch");
    logChatLatency(requestId, requestStartAt, "last_message_done", {
      segmentMs: Math.round(performance.now() - lastMessageStartedAt),
    });
    const previousConversationState = extractConversationState(lastAiMessage?.metadata);
    const previousRecentlyAskedKeys = extractRecentlyAskedKeys(lastAiMessage?.metadata);

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
    userMessagePromise.catch(() => undefined);
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
          .catch((error) => { console.warn("[UniversalCapture] live conversation capture failed:", error); return null; });
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
            console.warn("[KnowledgeAcquisition] detection/memory candidate flow failed:", error);
          } finally {
            profiler.markEnd("memory_candidates");
          }
          return result;
        }).catch((error) => {
          profiler.markEnd("memory_candidates");
          console.warn("[MemoryCandidates] deferred candidate flow failed:", error);
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
            console.warn("[BusinessReality] deferred candidate extraction failed:", error);
            return {
              candidates: [],
              blockedAiGeneratedCount: 0,
              classification: "OTHER" as const,
            };
          });
      }
    };
    completeFirstExperienceAfterNormalTurn(authContext);

    const organizationSummary = [
      buildOrganizationSummary(authContext.organization),
      conversationExtensionHandoff
        ? `Customer runtime evidence (structured, not user-facing copy): ${JSON.stringify(conversationExtensionHandoff)}. Produce the single natural response yourself. Treat PROBABLE_CONTEXT_PRESENT as uncertain context, not a confirmed field or mutation. When resultStatus is CLARIFICATION_REQUIRED and entityResolution is AMBIGUOUS, tell the user one or more similarly named customers already exist (name them from candidateNames if present) and ask whether they mean an existing one or want to create a new record anyway; this is a real, resolvable ambiguity, not a missing capability. Never describe any CLARIFICATION_REQUIRED or OBSERVED outcome as missing permission, access, connection, or capability — those never apply here.`
        : null,
      businessNavigationOperationEvidence
        ? `Canonical business operation result (structured, not user-facing copy): ${JSON.stringify(businessNavigationOperationEvidence)}. The repository lookup completed. RESOLVED means the canonical customer was found and its Living Workspace surface was requested; acknowledge that result naturally. When createProposalAllowed is true, offer to open a new editable customer draft. Do not contradict this result or describe it as missing data, access, permission, connection, or capability.`
        : null,
    ].filter(Boolean).join("\n");


    // Conversation First: heavy cognition and learning are post-stream
    // consumers for both delivery channels.
    const learningLoopResult = null;
    const executiveOperatingSystem = null;
    let cognitionObservation: ReturnType<typeof buildChatExecutiveCognitionObservation> | null = null;
    console.info("[ChatExecutiveIntelligence] consumption resolved", {
      status: "deferred",
      requiresExecutiveReasoning,
      hasExecutiveOperatingSystem: executiveOperatingSystem !== null,
    });

    // gateway_call_start → gateway_call_ready is a black-box measurement of
    // everything streamWithAiGateway() does internally (operating context
    // build, prompt build, OpenAI request initiation) — that function has no
    // instrumentation of its own on this call path, and its internals live
    // in a different file (src/lib/ai/gateway/ai-gateway.ts), out of this
    // phase's scope. See report for what this implies.
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
    logChatLatency(requestId, requestStartAt, "provider_request_start");
    profiler.markStart("gateway_total");
    const gatewayStartedAt = performance.now();
    const conversationGuidanceStartedAt = performance.now();
    const streamHandle: AiGatewayStreamHandle = await streamWithAiGateway({
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
      preloadedMemoryContext: requestMemoryContext,
      conversationPresence: {
        recentTurnCount: lastAiMessage ? 1 : 0,
      },
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
    executiveRuntimeTrace.observeCanonicalPrompt(
      streamHandle.pre.systemPrompt,
      performance.now() - gatewayStartedAt,
    );
    logChatLatency(requestId, requestStartAt, "gateway_call_ready", {
      segmentMs: Math.round(performance.now() - gatewayStartedAt),
      contextProfile: runtimeResolution.contextProfile,
      readinessMode: responseReadiness.mode,
      requiresExecutiveReasoning,
    });
    const encoder = new TextEncoder();
    type PostStreamIntelligence = {
      executiveBrain: ExecutiveBrainShadowMetadata;
      executiveAssessment: ExecutiveAssessmentV1;
      cognitionObservation: ReturnType<typeof buildChatExecutiveCognitionObservation> | null;
      learningLoop: Awaited<ReturnType<typeof buildLearningLoop>> | null;
    };
    let postStreamIntelligencePromise: Promise<PostStreamIntelligence> | null = null;
    const startPostStreamIntelligence = () => {
      if (responseReadiness.mode === "immediate") return;
      if (postStreamIntelligencePromise) return;
      profiler.markStart("executive_intelligence");
      profiler.markStart("learning_loop");
      logChatLatency(requestId, requestStartAt, "post_stream_intelligence_start", {
        contextProfile: runtimeResolution.contextProfile,
        requiresExecutiveReasoning,
      });
      logChatLatency(requestId, requestStartAt, "post_stream_start");
      postStreamIntelligencePromise = Promise.all([
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
        requiresExecutiveReasoning
          ? resolveChatExecutiveCognition({
              organizationId: authContext.organization.id,
              message,
              generatedAt: new Date().toISOString(),
              understanding: conversationUnderstanding,
              preloadedMemoryContext: requestMemoryContext,
              onStageTiming: ({ stage, segmentMs }) => {
                logChatLatency(requestId, requestStartAt, stage, {
                  segmentMs,
                  contextProfile: runtimeResolution.contextProfile,
                  readinessMode: responseReadiness.mode,
                  requiresExecutiveReasoning,
                });
              },
            })
          : Promise.resolve(null),
        buildLearningLoop({
          organizationId: authContext.organization.id,
          activeMemoryItems,
        }),
      ]).then(([executiveBrain, cognition, learningLoop]) => {
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
          cognitionObservation: cognition
            ? buildChatExecutiveCognitionObservation(cognition)
            : null,
          learningLoop,
        };
      }).catch((error) => {
        profiler.markEnd("executive_intelligence");
        profiler.markEnd("learning_loop");
        console.warn("[ConversationFirst] post-stream intelligence failed:", error);
        return {
          executiveBrain: executiveBrainShadow,
          executiveAssessment,
          cognitionObservation: null,
          learningLoop: null,
        };
      });
    };
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let visibleDoneSent = false;
        try {
          if (executiveNavigationInput) {
            controller.enqueue(encoder.encode(JSON.stringify({
              type: "navigation",
              command: {
                correlationId,
                source: channel === "voice" ? "voice" : "written",
                ...executiveNavigationInput,
              },
            }) + "\n"));
            emitBusinessNavigationTelemetry("BusinessNavigation", {
              event: "stream_event_enqueued", correlationId, eventType: "navigation",
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
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: chunk }) + "\n"));
            if (!loggedFirstSseChunkSent) {
              loggedFirstSseChunkSent = true;
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
          let aiContent = await buildAiContent({
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
            canonicalCustomerResolved: businessNavigationOperationEvidence?.outcome === "RESOLVED",
            organizationSummary,
          });
          if (
            conversationExtensionHandoff
            && conversationExtensionHandoff.resultStatus === "CLARIFICATION_REQUIRED"
            && conversationExtensionHandoff.entityResolution === "AMBIGUOUS"
            && conversationExtensionHandoff.candidateNames.length > 0
          ) {
            aiContent = buildAmbiguousEntityClarificationMessage(conversationExtensionHandoff.candidateNames);
          }
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
                  universalCapture: null,
                },
              },
            }) + "\n",
          ));
          visibleDoneSent = true;
          logChatLatency(requestId, requestStartAt, "done_event_sent");
          logChatLatency(requestId, requestStartAt, "response_done");

          startPostStreamIntelligence();
          const [
            postStreamIntelligence,
            deferredCaptureActivation,
            deferredMemoryCandidates,
            deferredRealityCandidates,
          ] = await Promise.all([
            postStreamIntelligencePromise,
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
          if (postStreamIntelligence) {
            cognitionObservation = postStreamIntelligence.cognitionObservation;
          }

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
          logChatLatency(requestId, requestStartAt, "stream_error", {
            errorName: err instanceof Error ? err.name : typeof err,
          });
          if (!visibleDoneSent) {
            controller.enqueue(encoder.encode(
              JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Unknown error" }) + "\n",
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

    return new Response(readableStream, {
      // conversation.id is already known before a single chunk streams,
      // preserving continuity across a barge-in-aborted turn.
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId,
        "X-Conversation-Id": conversation.id,
      },
    });
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
  },
  reason: string,
): Promise<string> {
  const repairedResponse = await generateAiResponse({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    provider: input.aiResponse.provider,
    behaviorSurface: "repair",
    organizationSummary: input.organizationSummary,
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
    return "Bu reddedilen cevap, gercekte var olan bir yetki/erisim/baglanti eksikligi olmadan mutlak bir 'yapamam' ifadesi kurmustu. Musteri, gorev ve diger canonical islemler icin gercek mutation yetkisi ve baglantisi her zaman mevcuttur. Eger runtime evidence icinde entityResolution AMBIGUOUS ise, candidateNames listesindeki kayitlari kullaniciya adiyla soyle ve hangisini kastettigini veya yeni kayit acmak isteyip istemedigini sor. Asla yetkim/erisimim/baglantim yok, mevcut degil veya bulunmuyor gibi ifadeler kullanma.";
  }
  if (reason === "absolute_context_denial") {
    return "Bu reddedilen cevap, elindeki gercek veriyi yok sayarak mutlak bir bilgi eksikligi iddia etmisti. Sana saglanan runtime evidence ve sirket ozetindeki gercek veriyi kullanarak doğal ve dogru bir cevap uret.";
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
  executiveCognition: ReturnType<typeof buildChatExecutiveCognitionObservation> | null = null,
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
  const generatedAt = input.picture.generatedAt;
  const organizationId = input.organizationId?.trim();

  if (!organizationId) {
    return {
      executiveBrain: {
        mode: "unavailable",
        generatedAt,
        reason: "Organization context is not available.",
      },
      executiveAssessment: input.canonicalAssessment,
    };
  }

  try {
    const context = managementPictureToInternalContext(input.picture);
    const assessment = input.internalAssessment;
    const executiveAssessment = input.canonicalAssessment;

    input.profiler.markStart("executive_council");
    const councilStartedAt = performance.now();
    logChatLatency(input.requestId, input.requestStartAt, "executive_council", {
      phase: "start", segmentMs: 0, conversationId: input.conversationId,
      organizationId, success: true, errorReason: "NONE",
    });
    let council;
    try {
      council = buildExecutiveCouncil(context, assessment, executiveAssessment);
      input.profiler.markEnd("executive_council");
      logChatLatency(input.requestId, input.requestStartAt, "executive_council", {
        phase: "end", segmentMs: Math.round(performance.now() - councilStartedAt),
        conversationId: input.conversationId, organizationId, success: true, errorReason: "NONE",
      });
    } catch (error) {
      input.profiler.markEnd("executive_council");
      logChatLatency(input.requestId, input.requestStartAt, "executive_council", {
        phase: "end", segmentMs: Math.round(performance.now() - councilStartedAt),
        conversationId: input.conversationId, organizationId, success: false,
        errorReason: safeExecutiveBrainStageError(error),
      });
      throw error;
    }

    input.profiler.markStart("executive_strategic_profile");
    const profileStartedAt = performance.now();
    logChatLatency(input.requestId, input.requestStartAt, "executive_strategic_profile", {
      phase: "start", segmentMs: 0, conversationId: input.conversationId,
      organizationId, success: true, errorReason: "NONE",
    });
    let strategicProfile;
    try {
      strategicProfile = buildStrategicProfile(context);
      input.profiler.markEnd("executive_strategic_profile");
      logChatLatency(input.requestId, input.requestStartAt, "executive_strategic_profile", {
        phase: "end", segmentMs: Math.round(performance.now() - profileStartedAt),
        conversationId: input.conversationId, organizationId, success: true, errorReason: "NONE",
      });
    } catch (error) {
      input.profiler.markEnd("executive_strategic_profile");
      logChatLatency(input.requestId, input.requestStartAt, "executive_strategic_profile", {
        phase: "end", segmentMs: Math.round(performance.now() - profileStartedAt),
        conversationId: input.conversationId, organizationId, success: false,
        errorReason: safeExecutiveBrainStageError(error),
      });
      throw error;
    }

    input.profiler.markStart("executive_decision_package");
    const decisionStartedAt = performance.now();
    logChatLatency(input.requestId, input.requestStartAt, "executive_decision_package", {
      phase: "start", segmentMs: 0, conversationId: input.conversationId,
      organizationId, success: true, errorReason: "NONE",
    });
    let decisionPackage;
    try {
      decisionPackage = buildExecutiveDecisionPackage(context, assessment, council, strategicProfile);
      input.profiler.markEnd("executive_decision_package");
      logChatLatency(input.requestId, input.requestStartAt, "executive_decision_package", {
        phase: "end", segmentMs: Math.round(performance.now() - decisionStartedAt),
        conversationId: input.conversationId, organizationId, success: true, errorReason: "NONE",
      });
    } catch (error) {
      input.profiler.markEnd("executive_decision_package");
      logChatLatency(input.requestId, input.requestStartAt, "executive_decision_package", {
        phase: "end", segmentMs: Math.round(performance.now() - decisionStartedAt),
        conversationId: input.conversationId, organizationId, success: false,
        errorReason: safeExecutiveBrainStageError(error),
      });
      throw error;
    }

    input.profiler.markStart("executive_gm_brief");
    const briefStartedAt = performance.now();
    logChatLatency(input.requestId, input.requestStartAt, "executive_gm_brief", {
      phase: "start", segmentMs: 0, conversationId: input.conversationId,
      organizationId, success: true, errorReason: "NONE",
    });
    let brief;
    try {
      brief = buildAIGeneralManagerBrief({ context, assessment, council, strategicProfile, decisionPackage });
      input.profiler.markEnd("executive_gm_brief");
      logChatLatency(input.requestId, input.requestStartAt, "executive_gm_brief", {
        phase: "end", segmentMs: Math.round(performance.now() - briefStartedAt),
        conversationId: input.conversationId, organizationId, success: true, errorReason: "NONE",
      });
    } catch (error) {
      input.profiler.markEnd("executive_gm_brief");
      logChatLatency(input.requestId, input.requestStartAt, "executive_gm_brief", {
        phase: "end", segmentMs: Math.round(performance.now() - briefStartedAt),
        conversationId: input.conversationId, organizationId, success: false,
        errorReason: safeExecutiveBrainStageError(error),
      });
      throw error;
    }

    return {
      executiveBrain: {
        mode: "shadow",
        generatedAt,
        brief,
        decisionPackage,
        councilSummary: summarizeCouncil(council),
        strategicProfileSummary: strategicProfile.summary,
        recognitionSummary: summarizeRecognition(assessment),
        confidence: roundToTwoDecimals(
          (decisionPackage.confidence +
            council.confidence +
            strategicProfile.confidence.score) /
            3,
        ),
      },
      executiveAssessment,
    };
  } catch (error: unknown) {
    console.info("executive_assessment_unavailable", {
      requestId: input.requestId,
      conversationId: input.conversationId,
      channel: input.channel,
      source: "unavailable",
      status: "UNAVAILABLE",
      riskCount: 0,
      opportunityCount: 0,
      decisionFactorCount: 0,
      evidenceGapCount: 0,
      confidence: "LOW",
      latencyMs: 0,
      fallbackReason: safeExecutiveBrainStageError(error),
    });
    return {
      executiveBrain: {
        mode: "error",
        generatedAt,
        error: buildSafeExecutiveBrainError(error),
      },
      executiveAssessment: input.canonicalAssessment,
    };
  }
}

function safeExecutiveBrainStageError(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  return /^[A-Za-z][A-Za-z0-9]*Error$/u.test(error.name) ? error.name : "EXECUTIVE_BRAIN_STAGE_FAILED";
}

function summarizeCouncil(council: ExecutiveCouncil): string {
  return [
    council.executiveSummary,
    `Participants: ${council.participants.length}`,
    `Findings: ${council.findings.length}`,
    `Risks: ${council.risks.length}`,
    `Priorities: ${council.priorities.length}`,
    `Recommendations: ${council.recommendations.length}`,
  ].join(" | ");
}

function summarizeRecognition(
  assessment: ReturnType<typeof buildExecutiveAssessmentFromManagementPicture>["internalAssessment"],
): string {
  const recognition = assessment.recognition;

  return [
    `Owner: ${recognition.owner.label}`,
    `Company: ${recognition.company.label}`,
    `Customers: ${recognition.customers.label}`,
    `Personnel: ${recognition.personnel.label}`,
    `Operations: ${recognition.operations.label}`,
    `Finance: ${recognition.finance.label}`,
  ].join(" | ");
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

function buildSafeExecutiveBrainError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.slice(0, 180);
  }

  return "Executive Brain shadow evaluation failed.";
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
