import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
import { renderPromptTemplate } from "@/lib/ai/prompts/prompt-renderer";
import { projectExecutiveConversationGuidance } from "@/lib/ai/living-executive-presence";
import { getAiProvider } from "@/lib/ai/providers/provider-registry";
import { createOpenAiStream } from "@/lib/ai/providers/openai-provider";
import type { OpenAiStreamHandle } from "@/lib/ai/providers/openai-provider";
import { detectExecutiveObjection } from "@/lib/executive-conversation/executive-recommendation-detector.service";
import {
  buildExecutiveRecommendationPackage,
  buildRecommendationPackageFromNextMove,
} from "@/lib/executive-conversation/executive-recommendation-engine.service";
import { detectConversationSignal } from "@/lib/executive-conversation/executive-conversation-detector.service";
import {
  buildExecutiveConversationState,
  observeExecutiveMindState,
} from "@/lib/executive-conversation/executive-conversation-engine.service";
import { detectCommitmentOutcome } from "@/lib/executive-conversation/executive-commitment-detector.service";
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { buildGoalLearningDecision } from "@/lib/executive-goal-learning";
import { buildLearningResolverDecision } from "@/lib/executive-learning-resolver";

import type { AiProviderName, AiProviderUsage } from "@/lib/ai/providers/ai-provider";
import type {
  AiGatewayGenerateInput,
  AiGatewayGenerateResult,
} from "./ai-gateway.types";
import { createRequestProfiler } from "@/lib/ai/performance/request-profiler";
import { randomUUID } from "crypto";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";

// Diagnostic-only: timing and short constant/enum identifiers, never user
// message/prompt text, tokens, cookies, auth headers, API keys, env values,
// or full error messages. Logs unconditionally (no production gate) so the
// gateway_call_start → gateway_call_ready black box measured in
// src/app/api/ai/chat/route.ts can be broken down from inside this
// function. streamWithAiGateway's public input/output shape is untouched —
// this id is generated locally per call, not threaded from the caller.
type GatewayLatencyExtra = Record<string, number | string | boolean | undefined>;
const gatewayTimelineContexts = new Map<string, GatewayLatencyExtra>();

function logGatewayLatency(
  latencyId: string,
  startedAt: number,
  label: string,
  extra?: GatewayLatencyExtra,
): void {
  const now = performance.now();
  console.info("[ai-gateway][timeline]", JSON.stringify({
    event: label,
    requestId: latencyId,
    elapsedMs: Math.round(now - startedAt),
    at: now,
    ...gatewayTimelineContexts.get(latencyId),
    ...extra,
  }));
}

// Executive Cognitive Stack v1 — Faz 4 (Cognitive Validation). Diagnostic-only:
// booleans/counts, never mind state content (no attentionFocus/hypothesis/
// belief text). Validates that ExecutiveMindState is actually produced and
// carried forward across turns — no downstream consumer reads this log.
type MindStateObservationLogFields = {
  hasMindState: boolean;
  hypothesesCount: number;
  beliefsCount: number;
  hasAttentionFocus: boolean;
  workingMemoryCount: number;
  hasPreviousMindState: boolean;
};

function logMindStateObservation(label: string, fields: MindStateObservationLogFields): void {
  console.info("[cognitive-validation][mind-state]", { label, ...fields });
}

export type AiGatewayStreamPre = Omit<
  AiGatewayGenerateResult,
  "content" | "model" | "provider" | "usage" | "costTracking" | "rawResponseId"
>;

export type AiGatewayStreamHandle = {
  pre: AiGatewayStreamPre;
  textStream: AsyncGenerator<string, void, unknown>;
  getFinalMeta: () => Promise<{
    model: string;
    provider: AiProviderName;
    usage: AiProviderUsage | undefined;
    rawResponseId: string;
    content: string;
  }>;
};

const CHAT_STRICT_CONTEXT_STEPS = [
  "memoryContext",
  "personContext",
  "quoteContext",
  "paymentContext",
  "quoteConversionContext",
  "todayAnchorSnapshot",
  "recentSignalSnapshots",
  "syncCollectionActions",
  "collectionActionContext",
];

export async function generateWithAiGateway(
  input: AiGatewayGenerateInput,
): Promise<AiGatewayGenerateResult> {
  const executiveConversationGuidance = input.executiveBehaviorPlan
    ? projectExecutiveConversationGuidance(
        input.executiveBehaviorPlan,
        input.behaviorSurface ?? (input.promptTemplateId === "voice_conversation" ? "voice" : "chat"),
      )
    : null;
  input.onExecutiveConversationGuidanceObserved?.(executiveConversationGuidance);
  const gwProfiler = createRequestProfiler("chat_gateway");
  const providerName = resolveProviderName(input.provider);
  const templateId = input.promptTemplateId ?? "general_conversation";
  const executiveBrainContext = input.executiveBrainContext;
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(input.userMessage, input.previousConversationState?.phase ?? null);

  let recommendationPackage = null;
  let conversationState: ExecutiveConversationState | null = null;
  gwProfiler.markStart("operating_context");
  const operatingContext = await buildExecutiveOperatingContext({
    organizationId: input.organizationId,
    mode: "CHAT",
    conversationId: input.conversationId,
    executiveBrainContext,
    strictSteps: CHAT_STRICT_CONTEXT_STEPS,
    currentUserId: input.currentUserId,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
    writePolicy: {
      syncCollectionActions: true,
      writeSignalSnapshot: true,
      writeDecisionRecords: true,
    },
    resolveRuntimeAugmentation: ({ quoteIntelligence, quoteConversionContext }) => {
      const eosNextMove = input.executiveOperatingSystem?.recommendedNextMove ?? null;

      if (!eosNextMove && executiveBrainContext?.mode === "shadow" && !quoteIntelligence) {
        throw new Error("Quote intelligence is required for executive recommendation package.");
      }

      if (eosNextMove) {
        recommendationPackage = buildRecommendationPackageFromNextMove({
          recommendedNextMove: eosNextMove,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence ?? null,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence?.conversionIntelligence ?? null
            : null,
        });
      } else if (executiveBrainContext?.mode === "shadow") {
        recommendationPackage = buildExecutiveRecommendationPackage({
          decisionPackage: executiveBrainContext.decisionPackage,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence!,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence!.conversionIntelligence
            : null,
        });
      } else {
        recommendationPackage = null;
      }

      conversationState = buildExecutiveConversationState({
        previousState: input.previousConversationState ?? null,
        conversationSignal,
        objectionSignal,
        outcomeSignal,
        recommendationPackage,
      });
      conversationState = {
        ...conversationState,
        mindState: observeExecutiveMindState({
          state: conversationState,
          conversationSignal,
          objectionSignal,
          recommendationPackage,
          previousMindState: input.previousConversationState?.mindState ?? null,
        }),
      };
      logMindStateObservation("generate_with_ai_gateway", {
        hasMindState: !!conversationState.mindState,
        hypothesesCount: conversationState.mindState?.hypotheses?.length ?? 0,
        beliefsCount: conversationState.mindState?.beliefs?.length ?? 0,
        hasAttentionFocus: !!conversationState.mindState?.attentionFocus,
        workingMemoryCount: conversationState.mindState?.workingMemory?.length ?? 0,
        hasPreviousMindState: !!input.previousConversationState?.mindState,
      });

      return { recommendationPackage, conversationState };
    },
  });

  gwProfiler.markEnd("operating_context");

  if (!operatingContext.memoryContext || !operatingContext.quoteContext || !operatingContext.paymentContext || !operatingContext.collectionActionContext) {
    throw new Error("Required AI gateway operating context could not be built.");
  }

  gwProfiler.markStart("sync_intelligence_build");
  const goalLearningDecision =
    operatingContext.goalIntelligence != null && input.learningSnapshot != null
      ? buildGoalLearningDecision({
          goalIntelligence: operatingContext.goalIntelligence,
          snapshot: input.learningSnapshot,
        })
      : null;

  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision,
  });

  gwProfiler.markEnd("sync_intelligence_build");
  // PERF: coarse timing boundary — prompt_build includes string assembly only (no I/O)
  gwProfiler.markStart("prompt_build");
  const renderedPrompt = renderPromptTemplate({
    templateId,
    userMessage: input.userMessage,
    behaviorSurface: input.behaviorSurface ?? (templateId === "voice_conversation" ? "voice" : "chat"),
    livingBehaviorHint: input.livingBehaviorHint,
    executiveBehaviorPlan: input.executiveBehaviorPlan,
    executiveManagementPicture: input.executiveManagementPicture,
    executiveAssessment: input.executiveAssessment,
    executiveDirective: input.executiveDirective,
    executiveConversationGuidance,
    memoryContext: operatingContext.memoryContext,
  });
  gwProfiler.markEnd("prompt_build");
  const provider = getAiProvider(providerName);
  gwProfiler.markStart("openai_request");
  const response = await provider.generateResponse({
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: emptyProviderMemoryContext(operatingContext.memoryContext),
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
  });

  gwProfiler.markEnd("openai_request");
  gwProfiler.finish();

  return {
    content: response.content,
    model: response.model,
    provider: response.provider,
    conversationId: input.conversationId,
    memoryContext: operatingContext.memoryContext,
    collectionActionContext: operatingContext.collectionActionContext,
    quoteContext: operatingContext.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    usage: response.usage,
    costTracking: buildCostTrackingMetadata(response.usage),
    rawResponseId: response.rawResponseId,
    conversationState,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    resolverDecision,
  };
}

function resolveProviderName(provider?: AiProviderName): AiProviderName {
  return resolveConfiguredAiProvider(provider);
}

function emptyProviderMemoryContext(context: MemoryContext): MemoryContext {
  return {
    version: context.version,
    generatedAt: context.generatedAt,
    organizationId: context.organizationId,
    totalIncluded: 0,
    facts: [],
    processes: [],
    strategic: [],
    preferences: [],
    highlights: [],
    conflicts: [],
  };
}

// ─── Streaming gateway ────────────────────────────────────────────────────────
// Same pre-processing as generateWithAiGateway; provider call replaced with stream.

export async function streamWithAiGateway(
  input: AiGatewayGenerateInput,
): Promise<AiGatewayStreamHandle> {
  const latencyId = input.requestId ?? randomUUID().slice(0, 8);
  const latencyStartAt = performance.now();
  const trace = {
    correlationId: input.correlationId,
    turnId: input.turnId,
    conversationId: input.conversationId,
    channel: input.channel,
    contextProfile: input.contextProfile,
  };
  const executiveConversationGuidance = input.executiveBehaviorPlan
    ? projectExecutiveConversationGuidance(
        input.executiveBehaviorPlan,
        input.behaviorSurface ?? (input.promptTemplateId === "voice_conversation" ? "voice" : "chat"),
      )
    : null;
  input.onExecutiveConversationGuidanceObserved?.(executiveConversationGuidance);
  if (input.executiveBehaviorPlan && executiveConversationGuidance) {
    console.info("executive_conversation_guidance_projected", {
      requestId: input.requestId,
      channel: input.channel,
      primaryBehavior: input.executiveBehaviorPlan.primaryBehavior,
      interactionPosture: input.executiveBehaviorPlan.interactionPosture,
      questionPolicy: input.executiveBehaviorPlan.questionPolicy,
      challengePolicy: input.executiveBehaviorPlan.challengePolicy,
      pacingIntent: input.executiveBehaviorPlan.pacingIntent,
      requiresExecutiveReasoning: input.executiveBehaviorPlan.requiresExecutiveReasoning,
    });
  }
  if (gatewayTimelineContexts.size >= 1_000) {
    const oldest = gatewayTimelineContexts.keys().next().value;
    if (oldest) gatewayTimelineContexts.delete(oldest);
  }
  gatewayTimelineContexts.set(latencyId, trace);
  logGatewayLatency(latencyId, latencyStartAt, "stream_gateway_enter", trace);

  const providerName = resolveProviderName(input.provider);
  const templateId = input.promptTemplateId ?? "general_conversation";
  const executiveBrainContext = input.executiveBrainContext;
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(
    input.userMessage,
    input.previousConversationState?.phase ?? null,
  );

  let recommendationPackage = null;
  let conversationState: ExecutiveConversationState | null = null;

  const contextProfile = input.contextProfile ?? "full_context";
  if (
    contextProfile === "immediate_minimal"
    || contextProfile === "conversational_minimal"
    || contextProfile === "business_light"
  ) {
    const memoryContext: MemoryContext =
      contextProfile === "business_light" && input.preloadedMemoryContext
        ? input.preloadedMemoryContext
        : {
      version: "v1",
      generatedAt: new Date().toISOString(),
      organizationId: input.organizationId,
      totalIncluded: 0,
      facts: [],
      processes: [],
      strategic: [],
      preferences: [],
      highlights: [],
      conflicts: [],
    };
    const collectionActionContext = { openCount: 0, inProgressCount: 0, items: [] };
    const quoteContext = { openCount: 0, openTotal: 0, statusSummary: [], activeItems: [], lastWon: null };
    logGatewayLatency(latencyId, latencyStartAt, "operating_context_start", { contextProfile });
    logGatewayLatency(latencyId, latencyStartAt, "operating_context_done", { contextProfile, deferred: true });
    logGatewayLatency(latencyId, latencyStartAt, "prompt_render_start");
    const renderedPrompt = renderPromptTemplate({
      templateId,
      userMessage: input.userMessage,
      behaviorSurface: input.behaviorSurface ?? "chat",
      livingBehaviorHint: input.livingBehaviorHint,
      executiveBehaviorPlan: input.executiveBehaviorPlan,
      executiveManagementPicture: input.executiveManagementPicture,
      executiveAssessment: input.executiveAssessment,
      executiveDirective: input.executiveDirective,
      executiveConversationGuidance,
      memoryContext,
    });
    logGatewayLatency(latencyId, latencyStartAt, "prompt_render_done");
    logGatewayLatency(latencyId, latencyStartAt, "openai_stream_create_start", { providerName });
    const baseHandle = providerName === "openai"
      ? createOpenAiStream({ systemPrompt: renderedPrompt.systemPrompt, userMessage: input.userMessage, context: emptyProviderMemoryContext(memoryContext), metadata: { organizationId: input.organizationId, conversationId: input.conversationId } })
      : await createMockStreamHandle(input, renderedPrompt.systemPrompt, emptyProviderMemoryContext(memoryContext));
    logGatewayLatency(latencyId, latencyStartAt, "openai_stream_create_done", { providerName });
    logGatewayLatency(latencyId, latencyStartAt, "stream_gateway_return");
    return {
      pre: {
        conversationId: input.conversationId,
        memoryContext,
        collectionActionContext,
        quoteContext,
        systemPrompt: renderedPrompt.systemPrompt,
        promptTemplate: { id: renderedPrompt.templateId, version: renderedPrompt.templateVersion },
        conversationState: input.previousConversationState ?? null,
        executiveDecisionContext: null,
        resolverDecision: null,
        runDeferredOperatingContextWrites: async () => undefined,
      },
      textStream: observeProviderStream(baseHandle.textStream, latencyId, latencyStartAt),
      getFinalMeta: baseHandle.getFinalMeta,
    };
  }

  logGatewayLatency(latencyId, latencyStartAt, "operating_context_start");
  const operatingContext = await buildExecutiveOperatingContext({
    organizationId: input.organizationId,
    mode: "CHAT",
    conversationId: input.conversationId,
    executiveBrainContext,
    strictSteps: CHAT_STRICT_CONTEXT_STEPS,
    currentUserId: input.currentUserId,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
    preloadedMemoryContext: input.preloadedMemoryContext,
    writePolicy: {
      syncCollectionActions: true,
      writeSignalSnapshot: true,
      writeDecisionRecords: true,
    },
    // Streaming response path: the 4 write-policy side effects don't inform
    // this turn's prompt (verified — none of their outputs are read by the
    // renderer), so they're deferred and run after the response via
    // aiResponse.runDeferredOperatingContextWrites() in route.ts instead of
    // blocking the first token here.
    deferWrites: true,
    onStepTiming: (timing) => logGatewayLatency(latencyId, latencyStartAt, "operating_context_step", timing),
    resolveRuntimeAugmentation: ({ quoteIntelligence, quoteConversionContext }) => {
      const eosNextMove = input.executiveOperatingSystem?.recommendedNextMove ?? null;

      if (!eosNextMove && executiveBrainContext?.mode === "shadow" && !quoteIntelligence) {
        throw new Error("Quote intelligence is required for executive recommendation package.");
      }

      if (eosNextMove) {
        recommendationPackage = buildRecommendationPackageFromNextMove({
          recommendedNextMove: eosNextMove,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence ?? null,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence?.conversionIntelligence ?? null
            : null,
        });
      } else if (executiveBrainContext?.mode === "shadow") {
        recommendationPackage = buildExecutiveRecommendationPackage({
          decisionPackage: executiveBrainContext.decisionPackage,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence!,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence!.conversionIntelligence
            : null,
        });
      } else {
        recommendationPackage = null;
      }

      conversationState = buildExecutiveConversationState({
        previousState: input.previousConversationState ?? null,
        conversationSignal,
        objectionSignal,
        outcomeSignal,
        recommendationPackage,
      });
      conversationState = {
        ...conversationState,
        mindState: observeExecutiveMindState({
          state: conversationState,
          conversationSignal,
          objectionSignal,
          recommendationPackage,
          previousMindState: input.previousConversationState?.mindState ?? null,
        }),
      };
      logMindStateObservation("stream_with_ai_gateway", {
        hasMindState: !!conversationState.mindState,
        hypothesesCount: conversationState.mindState?.hypotheses?.length ?? 0,
        beliefsCount: conversationState.mindState?.beliefs?.length ?? 0,
        hasAttentionFocus: !!conversationState.mindState?.attentionFocus,
        workingMemoryCount: conversationState.mindState?.workingMemory?.length ?? 0,
        hasPreviousMindState: !!input.previousConversationState?.mindState,
      });

      return { recommendationPackage, conversationState };
    },
  });
  logGatewayLatency(latencyId, latencyStartAt, "operating_context_done");

  if (
    !operatingContext.memoryContext ||
    !operatingContext.quoteContext ||
    !operatingContext.paymentContext ||
    !operatingContext.collectionActionContext
  ) {
    throw new Error("Required AI gateway operating context could not be built.");
  }

  const goalLearningDecision =
    operatingContext.goalIntelligence != null && input.learningSnapshot != null
      ? buildGoalLearningDecision({
          goalIntelligence: operatingContext.goalIntelligence,
          snapshot: input.learningSnapshot,
        })
      : null;

  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision,
  });

  logGatewayLatency(latencyId, latencyStartAt, "prompt_render_start");
  const renderedPrompt = renderPromptTemplate({
    templateId,
    userMessage: input.userMessage,
    behaviorSurface: input.behaviorSurface ?? (templateId === "voice_conversation" ? "voice" : "chat"),
    livingBehaviorHint: input.livingBehaviorHint,
    executiveBehaviorPlan: input.executiveBehaviorPlan,
    executiveManagementPicture: input.executiveManagementPicture,
    executiveAssessment: input.executiveAssessment,
    executiveDirective: input.executiveDirective,
    executiveConversationGuidance,
    memoryContext: operatingContext.memoryContext,
  });
  logGatewayLatency(latencyId, latencyStartAt, "prompt_render_done");

  const providerInput = {
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: emptyProviderMemoryContext(operatingContext.memoryContext),
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
  };

  let streamHandle: OpenAiStreamHandle;

  logGatewayLatency(latencyId, latencyStartAt, "openai_stream_create_start", { providerName });
  if (providerName === "openai") {
    streamHandle = createOpenAiStream(providerInput);
  } else {
    // mock provider: collect response synchronously, yield as single chunk
    const mockResult = await getAiProvider("mock").generateResponse(providerInput);
    const mockContent = mockResult.content;
    async function* mockTextStream(): AsyncGenerator<string, void, unknown> {
      yield mockContent;
    }
    streamHandle = {
      textStream: mockTextStream(),
      getFinalMeta: async () => ({
        model: mockResult.model,
        provider: mockResult.provider,
        usage: mockResult.usage,
        rawResponseId: "",
        content: mockContent,
      }),
    };
  }
  logGatewayLatency(latencyId, latencyStartAt, "openai_stream_create_done", { providerName });

  const pre: AiGatewayStreamPre = {
    conversationId: input.conversationId,
    memoryContext: operatingContext.memoryContext,
    collectionActionContext: operatingContext.collectionActionContext,
    quoteContext: operatingContext.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    conversationState,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    resolverDecision,
    runDeferredOperatingContextWrites: operatingContext.runDeferredOperatingContextWrites,
  };

  logGatewayLatency(latencyId, latencyStartAt, "stream_gateway_return");
  return {
    pre,
    textStream: observeProviderStream(streamHandle.textStream, latencyId, latencyStartAt),
    getFinalMeta: streamHandle.getFinalMeta,
  };
}

async function createMockStreamHandle(input: AiGatewayGenerateInput, systemPrompt: string, memoryContext: MemoryContext): Promise<OpenAiStreamHandle> {
  const result = await getAiProvider("mock").generateResponse({ systemPrompt, userMessage: input.userMessage, context: memoryContext });
  async function* textStream() { yield result.content; }
  return { textStream: textStream(), getFinalMeta: async () => ({ model: result.model, provider: result.provider, usage: result.usage, rawResponseId: "", content: result.content }) };
}

async function* observeProviderStream(stream: AsyncGenerator<string, void, unknown>, requestId: string, startedAt: number) {
  let first = true;
  for await (const delta of stream) {
    if (first) {
      first = false;
      logGatewayLatency(requestId, startedAt, "provider_first_delta", { deltaChars: delta.length });
    }
    yield delta;
  }
  logGatewayLatency(requestId, startedAt, "provider_stream_complete");
}
