import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { streamWithAiGateway } from "@/lib/ai/gateway/ai-gateway";
import type { AiGatewayStreamHandle } from "@/lib/ai/gateway/ai-gateway";
import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import { fail, ok } from "@/lib/api/response";
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
import { buildExecutiveAssessment } from "@/lib/executive-brain/executive-brain-assessment.service";
import { buildExecutiveBrainContext } from "@/lib/executive-brain/executive-brain-context-builder.service";
import { buildExecutiveCouncil } from "@/lib/executive-brain/executive-council.service";
import { buildExecutiveDecisionPackage } from "@/lib/executive-brain/executive-decision-engine.service";
import { buildStrategicProfile } from "@/lib/executive-brain/strategic-profile.service";
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
import { detectCollectionActionSignals } from "@/lib/core/collection-actions/collection-action-lifecycle-detector";
import { applyCollectionActionLifecycle } from "@/lib/core/collection-actions/collection-action-lifecycle-applier";
import { detectQuoteWorkflowSignals } from "@/lib/core/quotes/quote-workflow-lifecycle-detector";
import { applyQuoteWorkflowLifecycle } from "@/lib/core/quotes/quote-workflow-lifecycle-applier";
import {
  registerExecutiveDecisionCommitment,
  registerExecutiveDecisionOutcome,
} from "@/lib/executive-decision-loop";
import {
  completeExecutiveAction,
  listOpenExecutiveActions,
} from "@/lib/core/executive-actions/executive-action-engine.service";
import { detectExecutiveActionOutcomeSignals } from "@/lib/core/executive-actions/executive-action-outcome-capture.service";

import { MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";
import type { MemoryCandidate, Prisma } from "@prisma/client";
import type { GenerateAiResponseResult } from "@/lib/ai/ai.types";
import { sanitizeExecutiveManagerResponse } from "@/lib/ai/executive-presence-layer";
import { buildExecutivePresenceSurfacePolicy } from "@/lib/ai/identity/executive-identity-prompt";
import {
  detectExecutiveGap,
  getGapSafeFallback,
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
import { classifyConversation, tryFastPathClassification } from "@/lib/conversation-understanding";
import { createRequestProfiler } from "@/lib/ai/performance/request-profiler";
import {
  createShadowExecutiveRequestResolver,
  observeShadowExecutiveRequestResolution,
  recordShadowFastPathSkip,
} from "@/lib/executive-request-resolution";
import { prisma } from "@/lib/core/shared/prisma";
import { USER_MESSAGE_CREATED } from "@/lib/core/events/event-names";
import { randomUUID } from "crypto";
import { tryVoiceFastPath } from "./voice-v4-orchestrator";
import {
  buildTechnicalRepairUnavailableMessage,
  extractConversationState,
  logChatLatency,
  preserveDurableStateOnGapIntercept,
} from "./chat-shared";

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
  const requestStartAt = performance.now();
  logChatLatency(requestId, requestStartAt, "request_received");

  const profiler = createRequestProfiler("chat");
  profiler.markStart("route_total");
  try {
    logChatLatency(requestId, requestStartAt, "auth_context_start");
    const authContext = await requireAuthContextFromCookies();
    logChatLatency(requestId, requestStartAt, "auth_context_done");

    const rateLimited = await isChatRateLimited({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
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
    const channel = optionalStringEnum(body, "channel", ["voice", "text"] as const) ?? "text";
    if (channel === "voice") {
      logChatLatency(requestId, requestStartAt, "voice_v4_request_received");
    }
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
    logChatLatency(requestId, requestStartAt, "conversation_resolve_start");
    profiler.markStart("active_memory_fetch");
    logChatLatency(requestId, requestStartAt, "memory_context_loading_start");

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
    logChatLatency(requestId, requestStartAt, "conversation_resolve_done");
    profiler.markEnd("active_memory_fetch");
    logChatLatency(requestId, requestStartAt, "memory_context_loading_done");

    if (!conversation) {
      return fail("Conversation is not available for this organization.", 403);
    }

    // buildLearningLoop's result is not consumed by tryVoiceFastPath and is
    // only needed later (streamWithAiGateway input / done-event metadata in
    // the blocking pipeline). Kick it off here but don't await it yet, so it
    // no longer holds up the voice fast path from starting.
    profiler.markStart("learning_loop");
    const learningLoopPromise = buildLearningLoop({ organizationId: authContext.organization.id });
    // Some paths below (gap intercept, voice fast path) return before this
    // promise is ever awaited. Attach a no-op catch so an eventual rejection
    // never surfaces as an unhandled promise rejection; the real error is
    // still handled at the `await learningLoopPromise` site for the paths
    // that do consume it.
    learningLoopPromise.catch(() => undefined);

    const managerAdviceAnalysis = analyzeManagerAdvice({
      message,
      activeMemories: activeMemoryItems,
    });
    if (channel === "voice") {
      try {
        const voiceOrganizationSummary = buildOrganizationSummary(authContext.organization);
        const voiceFastResponse = await tryVoiceFastPath({
          requestId,
          requestStartAt,
          profiler,
          authContext,
          conversation,
          conversationId,
          message,
          organizationSummary: voiceOrganizationSummary,
          managerAdviceAnalysis,
          activeMemoryItems,
          classifyPromise,
        });
        if (voiceFastResponse) {
          recordShadowFastPathSkip({ requestId });
          return voiceFastResponse;
        }
      } catch (error) {
        console.warn("[VoiceV4] tryVoiceFastPath failed, falling back to blocking pipeline:", error);
      }
      logChatLatency(requestId, requestStartAt, "voice_v4_blocking_path_selected");
    }

    // Not consumed by tryVoiceFastPath (only managerAdviceAnalysis is) — only
    // needed by the blocking pipeline below, so built here instead of before
    // the voice fast path attempt.
    const managerAdviceBrief =
      buildManagerAdviceBrief(managerAdviceAnalysis);
    const managerAdviceResponseDraft =
      buildManagerAdviceResponseDraft(managerAdviceBrief);
    const managerAdviceComposedResponse = composeManagerAdviceResponse(
      managerAdviceResponseDraft,
    );
    const managerAdviceAugmentationContext =
      buildManagerAdviceAugmentationContext({
        analysis: managerAdviceAnalysis,
        brief: managerAdviceBrief,
        responseDraft: managerAdviceResponseDraft,
        composedResponse: managerAdviceComposedResponse,
      });

    profiler.markStart("conversation_classify");
    const conversationUnderstanding = await classifyPromise;
    profiler.markEnd("conversation_classify");
    logChatLatency(requestId, requestStartAt, "classification_done", {
      fastPath: fastPathResult.matched,
    });
    void observeShadowExecutiveRequestResolution({
      requestId,
      channel,
      organizationId: authContext.organization.id,
      understanding: conversationUnderstanding,
      resolver: shadowResolver,
    });
    const requiresExecutiveReasoning = conversationUnderstanding.shouldInvokeExecutiveBrain;

    logChatLatency(requestId, requestStartAt, "executive_brain_decision_start", {
      requiresExecutiveReasoning,
    });
    profiler.markStart("executive_brain");
    const executiveBrainShadow = requiresExecutiveReasoning
      ? await buildExecutiveBrainShadowMetadata({ organizationId: authContext.organization.id })
      : { mode: "unavailable" as const, generatedAt: new Date().toISOString(), reason: "Executive reasoning not required." };
    profiler.markEnd("executive_brain");
    logChatLatency(requestId, requestStartAt, "executive_brain_decision_done", {
      mode: executiveBrainShadow.mode,
    });
    const executiveConstitutionContext = buildExecutiveConstitutionContext();
    const executiveCouncilActivation =
      resolveExecutiveCouncilActivation(message);

    profiler.markStart("last_message_fetch");
    const lastAiMessage = conversationId
      ? await findLastAiMessageByConversation(conversation.id)
      : null;
    profiler.markEnd("last_message_fetch");
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
    const userMessage = await sendUserMessage({
      organizationId: authContext.organization.id,
      conversationId: conversation.id,
      actorUserId: authContext.user.id,
      content: message,
    });
    profiler.markEnd("user_message_write");
    profiler.markStart("memory_candidates");
    const memoryUpdateCandidates = await createDeterministicUpdateCandidates({
      organizationId: authContext.organization.id,
      createdByUserId: authContext.user.id,
      sourceMessageId: userMessage.id,
      message,
      activeMemoryItems,
    });
    profiler.markEnd("memory_candidates");

    try {
      const knowledgeDetections = detectExecutiveKnowledge({ message });
      if (knowledgeDetections.length > 0) {
        const knowledgeCandidates = mapKnowledgeDetectionsToMemoryCandidates({
          detections: knowledgeDetections,
          organizationId: authContext.organization.id,
          createdByUserId: authContext.user.id,
          sourceMessageId: userMessage.id,
        });
        await createMissingMemoryCandidates({
          organizationId: authContext.organization.id,
          createdByUserId: authContext.user.id,
          candidates: knowledgeCandidates,
        });
      }
    } catch (error) {
      console.warn("[KnowledgeAcquisition] detection/memory candidate flow failed:", error);
    }

    const organizationSummary = buildOrganizationSummary(authContext.organization);

    const gapResult = detectExecutiveGap({
      message,
      analysis: managerAdviceAnalysis,
    });

    if (gapResult.hasGap) {
      const gapSanitization = sanitizeExecutiveManagerResponse({
        content: gapResult.criticalQuestion,
        userMessage: message,
      });
      const gapContent = gapSanitization.needsRepair
        ? getGapSafeFallback()
        : gapSanitization.content;
      const gapAiMessage = await sendAiMessage({
        organizationId: authContext.organization.id,
        conversationId: conversation.id,
        content: gapContent,
        metadata: {
          provider: "mock",
          model: "gap_intercept",
          executiveGapDetected: true,
          gapReason: gapResult.reason,
          memoryContextSummary: {
            version: "gap",
            totalIncluded: 0,
            highlights: 0,
            facts: 0,
            processes: 0,
            strategic: 0,
            preferences: 0,
            conflicts: 0,
          },
          memoryUpdateCandidates: [],
          usage: null,
          costTracking: null,
          rawResponseId: null,
          conversationState: preserveDurableStateOnGapIntercept(previousConversationState),
        },
      });
      profiler.markEnd("route_total");
      profiler.finish();
      logChatLatency(requestId, requestStartAt, "gap_intercept_response");
      return ok({
        conversationId: conversation.id,
        userMessage,
        aiMessage: gapAiMessage,
        ai: {
          content: gapContent,
          provider: "mock",
          model: "gap_intercept",
          memoryContextSummary: {
            version: "gap",
            totalIncluded: 0,
            highlights: 0,
            facts: 0,
            processes: 0,
            strategic: 0,
            preferences: 0,
            conflicts: 0,
          },
          memoryUpdateCandidates: 0,
          metadata: {
            executiveGapDetected: true,
            gapReason: gapResult.reason,
          },
        },
      });
    }

    profiler.markStart("executive_intelligence");
    const cognitionPromise = resolveChatExecutiveCognition({
      organizationId: authContext.organization.id,
      message,
      generatedAt: new Date().toISOString(),
      understanding: conversationUnderstanding,
    });

    const [cognition, learningLoopResult] = await Promise.all([
      cognitionPromise,
      learningLoopPromise,
    ]);
    profiler.markEnd("executive_intelligence");
    profiler.markEnd("learning_loop");
    const executiveOperatingSystem = cognition.executiveOperatingSystem;
    const cognitionObservation = buildChatExecutiveCognitionObservation(cognition);
    console.info("[ChatExecutiveIntelligence] consumption resolved", {
      status: cognition.status,
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
    profiler.markStart("gateway_total");
    const streamHandle: AiGatewayStreamHandle = await streamWithAiGateway({
      organizationId: authContext.organization.id,
      conversationId: conversation.id,
      userMessage: message,
      organizationSummary,
      promptTemplateId: channel === "voice" ? "voice_conversation" : undefined,
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
    });
    logChatLatency(requestId, requestStartAt, "gateway_call_ready");
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let loggedFirstUpstreamChunk = false;
          let loggedFirstSseChunkSent = false;
          for await (const chunk of streamHandle.textStream) {
            if (!loggedFirstUpstreamChunk) {
              loggedFirstUpstreamChunk = true;
              logChatLatency(requestId, requestStartAt, "first_upstream_chunk_received");
            }
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: chunk }) + "\n"));
            if (!loggedFirstSseChunkSent) {
              loggedFirstSseChunkSent = true;
              logChatLatency(requestId, requestStartAt, "first_sse_chunk_sent");
            }
          }

          const finalMeta = await streamHandle.getFinalMeta();
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
          const aiContent = await buildAiContent({
            aiResponse,
            userMessage: message,
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            managerAdviceAugmentationContext,
            executiveBrainContext: executiveBrainShadow,
            executiveConstitutionContext,
            executiveCouncilActivation,
          });
          profiler.markEnd("ai_content_build");

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
                memoryUpdateCandidates: memoryUpdateCandidates.created.length,
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
                  executiveDelegation: aiResponse.executiveDelegationResult ?? null,
                  executiveResponsibilityMatrix: aiResponse.executiveResponsibilityMatrixResult ?? null,
                  executivePerformanceSignal: aiResponse.executivePerformanceSignalResult ?? null,
                  executiveManagementReview: aiResponse.executiveManagementReviewResult ?? null,
                  executiveCognition: cognitionObservation,
                },
              },
            }) + "\n",
          ));
          logChatLatency(requestId, requestStartAt, "done_event_sent");

          profiler.markStart("operating_context_deferred_writes");
          try {
            await aiResponse.runDeferredOperatingContextWrites?.();
          } catch (error) {
            console.warn("[ExecutiveOperatingContext] Deferred write execution failed:", error);
          }
          profiler.markEnd("operating_context_deferred_writes");

          profiler.markStart("post_ai_writes");
          const lifecycleSignals = detectCollectionActionSignals({
            message,
            activeActions: aiResponse.collectionActionContext.items,
          });
          await applyCollectionActionLifecycle({
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            signals: lifecycleSignals,
          });

          const quoteWorkflowSignals = detectQuoteWorkflowSignals({
            message,
            activeItems: aiResponse.quoteContext.activeItems,
          });
          await applyQuoteWorkflowLifecycle({
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            signals: quoteWorkflowSignals,
          });

          if (authContext.organization.id && message.trim().length > 0) {
            const closedActionIds = new Set<string>();
            try {
              const openActions = await listOpenExecutiveActions(authContext.organization.id);
              if (openActions.length > 0) {
                const outcomeSignals = detectExecutiveActionOutcomeSignals({
                  message,
                  openActions: openActions.map((a) => ({
                    id: a.id,
                    title: a.title,
                    reason: a.reason,
                  })),
                });
                if (outcomeSignals.length === 1 && outcomeSignals[0].outcomeStatus !== "UNKNOWN") {
                  const signal = outcomeSignals[0];
                  if (!closedActionIds.has(signal.actionId)) {
                    closedActionIds.add(signal.actionId);
                    try {
                      await completeExecutiveAction({
                        id: signal.actionId,
                        organizationId: authContext.organization.id,
                        resultSummary: signal.resultSummary,
                        outcomeStatus: signal.outcomeStatus,
                      });
                    } catch (err) {
                      console.warn("[ExecutiveActionCapture] completeExecutiveAction failed:", err);
                    }
                  }
                }
              }
            } catch (err) {
              console.warn("[ExecutiveActionCapture] Outcome capture failed:", err);
            }
          }
          profiler.markEnd("post_ai_writes");

          profiler.markStart("ai_message_write");
          await sendAiMessage({
            organizationId: authContext.organization.id,
            conversationId: conversation.id,
            content: aiContent,
            metadata: buildAiMessageMetadata(
              aiResponse,
              memoryUpdateCandidates.created,
              aiResponse.resolverDecision?.shouldAskNow ? (aiResponse.resolverDecision.targetKey ?? null) : null,
              buildNextRecentlyAskedKeys(
                previousRecentlyAskedKeys,
                aiResponse.resolverDecision?.shouldAskNow ? (aiResponse.resolverDecision.targetKey ?? null) : null,
              ),
              cognitionObservation,
            ),
          });
          profiler.markEnd("ai_message_write");

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
              const outcomeLabel =
                newState.commitmentOutcome === "SUCCESS"
                  ? "başarılı"
                  : newState.commitmentOutcome === "FAILURE"
                    ? "başarısız"
                    : "vazgeçildi";
              try {
                await registerExecutiveDecisionOutcome({
                  organizationId: authContext.organization.id,
                  conversationId: conversation.id,
                  sourceMessageId: userMessage.id,
                  committedTitle: newState.committedTitle,
                  outcome: newState.commitmentOutcome,
                  summary: `${newState.committedTitle}: ${outcomeLabel}`,
                  evidenceJson: {
                    previousPhase: previousConversationState?.phase ?? null,
                    currentPhase: newState.phase,
                  },
                });
              } catch (error) {
                console.error("[ExecutiveDecisionLoop] Outcome update failed:", error);
              }

              await createMissingMemoryCandidates({
                organizationId: authContext.organization.id,
                createdByUserId: authContext.user.id,
                candidates: [
                  {
                    subjectType: MemorySubjectType.PROCESS,
                    proposedType: MemoryItemType.PROCESS,
                    proposedKey: "karar_sonucu",
                    proposedValue: `${newState.committedTitle}: ${outcomeLabel}`,
                    source: MemoryItemSource.USER_PROVIDED,
                    confidence: 0.90,
                    isAssumption: false,
                    reason: "Kullanici taahhudunun sonucunu bildirdi.",
                    sourceMessageId: userMessage.id,
                  },
                ],
              });
            }
          }

          profiler.markEnd("route_total");
          profiler.finish();
          controller.close();
        } catch (err: unknown) {
          profiler.markEnd("route_total");
          profiler.finish();
          logChatLatency(requestId, requestStartAt, "stream_error", {
            errorName: err instanceof Error ? err.name : typeof err,
          });
          controller.enqueue(encoder.encode(
            JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Unknown error" }) + "\n",
          ));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
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

function buildAiContent(input: {
  aiResponse: GenerateAiResponseResult;
  userMessage: string;
  organizationId: string;
  conversationId: string;
  managerAdviceAugmentationContext: ManagerAdviceAugmentationContext | null;
  executiveBrainContext: ExecutiveBrainShadowMetadata;
  executiveConstitutionContext: ExecutiveConstitutionContext;
  executiveCouncilActivation: ExecutiveCouncilActivation;
}): Promise<string> {
  const sanitization = sanitizeExecutiveManagerResponse({
    content: input.aiResponse.content,
    userMessage: input.userMessage,
  });

  if (!sanitization.needsRepair) {
    return Promise.resolve(sanitization.content);
  }

  if (input.aiResponse.provider === "mock") {
    return Promise.resolve(buildTechnicalRepairUnavailableMessage());
  }

  return repairAiContent(input, sanitization.reason);
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
  },
  reason: string,
): Promise<string> {
  const repairedResponse = await generateAiResponse({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    provider: input.aiResponse.provider,
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
  });

  if (!repairedSanitization.needsRepair) {
    return repairedSanitization.content;
  }

  return buildTechnicalRepairUnavailableMessage();
}

function buildExecutiveRepairUserMessage(input: {
  originalUserMessage: string;
  rejectedContent: string;
  reason: string;
}): string {
  return [
    "Onceki cevap kalite kontrolunden gecmedi.",
    `Sebep: ${input.reason}.`,
    buildExecutivePresenceSurfacePolicy({ surface: "repair" }),
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
    executiveDelegationResult: aiResponse.executiveDelegationResult ?? null,
    executiveResponsibilityMatrixResult: aiResponse.executiveResponsibilityMatrixResult ?? null,
    executivePerformanceSignalResult: aiResponse.executivePerformanceSignalResult ?? null,
    executiveManagementReviewResult: aiResponse.executiveManagementReviewResult ?? null,
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
}): Promise<ExecutiveBrainShadowMetadata> {
  const generatedAt = new Date().toISOString();
  const organizationId = input.organizationId?.trim();

  if (!organizationId) {
    return {
      mode: "unavailable",
      generatedAt,
      reason: "Organization context is not available.",
    };
  }

  try {
    const context = await buildExecutiveBrainContext({
      organizationId,
      now: generatedAt,
    });
    const assessment = buildExecutiveAssessment(context);
    const council = buildExecutiveCouncil(context, assessment);
    const strategicProfile = buildStrategicProfile(context);
    const decisionPackage = buildExecutiveDecisionPackage(
      context,
      assessment,
      council,
      strategicProfile,
    );
    const brief = buildAIGeneralManagerBrief({
      context,
      assessment,
      council,
      strategicProfile,
      decisionPackage,
    });

    return {
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
    };
  } catch (error: unknown) {
    return {
      mode: "error",
      generatedAt,
      error: buildSafeExecutiveBrainError(error),
    };
  }
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
  assessment: ReturnType<typeof buildExecutiveAssessment>,
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

function buildSafeExecutiveBrainError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.slice(0, 180);
  }

  return "Executive Brain shadow evaluation failed.";
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
