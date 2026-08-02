import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
import { renderPromptTemplate } from "@/lib/ai/prompts/prompt-renderer";
import { projectExecutiveConversationGuidance } from "@/lib/ai/living-executive-presence";
import { getAiProvider } from "@/lib/ai/providers/provider-registry";
import { createOpenAiStream } from "@/lib/ai/providers/openai-provider";
import type { OpenAiStreamHandle } from "@/lib/ai/providers/openai-provider";
import { detectExecutiveObjection } from "@/lib/executive-conversation/executive-recommendation-detector.service";
import { detectConversationSignal } from "@/lib/executive-conversation/executive-conversation-detector.service";
import {
  buildExecutiveConversationState,
  observeExecutiveMindState,
} from "@/lib/executive-conversation/executive-conversation-engine.service";
import { detectCommitmentOutcome } from "@/lib/executive-conversation/executive-commitment-detector.service";
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
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(input.userMessage, input.previousConversationState?.phase ?? null);

  const conversationState = buildCanonicalConversationState(
    input,
    conversationSignal,
    objectionSignal,
    outcomeSignal,
    "generate_with_ai_gateway",
  );
  const projection = buildCanonicalGatewayProjection(input);

  gwProfiler.markStart("sync_intelligence_build");
  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision: null,
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
    memoryContext: projection.memoryContext,
    organizationSummary: input.organizationSummary,
  });
  gwProfiler.markEnd("prompt_build");
  const provider = getAiProvider(providerName);
  gwProfiler.markStart("openai_request");
  const response = await provider.generateResponse({
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: emptyProviderMemoryContext(projection.memoryContext),
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
    history: input.conversationHistory ?? undefined,
  });

  gwProfiler.markEnd("openai_request");
  gwProfiler.finish();

  return {
    content: response.content,
    model: response.model,
    provider: response.provider,
    conversationId: input.conversationId,
    memoryContext: projection.memoryContext,
    collectionActionContext: projection.collectionActionContext,
    quoteContext: projection.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    usage: response.usage,
    costTracking: buildCostTrackingMetadata(response.usage),
    rawResponseId: response.rawResponseId,
    conversationState,
    executiveDecisionContext: null,
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

function buildCanonicalGatewayProjection(input: AiGatewayGenerateInput) {
  const memoryContext: MemoryContext = input.preloadedMemoryContext ?? {
    version: "v1",
    generatedAt: input.executiveManagementPicture?.generatedAt ?? new Date().toISOString(),
    organizationId: input.organizationId,
    totalIncluded: 0,
    facts: [],
    processes: [],
    strategic: [],
    preferences: [],
    highlights: [],
    conflicts: [],
  };

  return {
    memoryContext,
    collectionActionContext: { openCount: 0, inProgressCount: 0, items: [] },
    quoteContext: {
      openCount: 0,
      openTotal: 0,
      statusSummary: [],
      activeItems: [],
      lastWon: null,
    },
  };
}

function buildCanonicalConversationState(
  input: AiGatewayGenerateInput,
  conversationSignal: ReturnType<typeof detectConversationSignal>,
  objectionSignal: ReturnType<typeof detectExecutiveObjection>,
  outcomeSignal: ReturnType<typeof detectCommitmentOutcome>,
  observationLabel: string,
): ExecutiveConversationState {
  const recommendationPackage = null;
  const state = buildExecutiveConversationState({
    previousState: input.previousConversationState ?? null,
    conversationSignal,
    objectionSignal,
    outcomeSignal,
    recommendationPackage,
  });
  const conversationState = {
    ...state,
    mindState: observeExecutiveMindState({
      state,
      conversationSignal,
      objectionSignal,
      recommendationPackage,
      previousMindState: input.previousConversationState?.mindState ?? null,
    }),
  };
  logMindStateObservation(observationLabel, {
    hasMindState: !!conversationState.mindState,
    hypothesesCount: conversationState.mindState?.hypotheses?.length ?? 0,
    beliefsCount: conversationState.mindState?.beliefs?.length ?? 0,
    hasAttentionFocus: !!conversationState.mindState?.attentionFocus,
    workingMemoryCount: conversationState.mindState?.workingMemory?.length ?? 0,
    hasPreviousMindState: !!input.previousConversationState?.mindState,
  });
  return conversationState;
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
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(
    input.userMessage,
    input.previousConversationState?.phase ?? null,
  );

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
      // business_light is the profile data_lookup/customer_context queries
      // use (see conversation-runtime-profile.ts) — exactly where canonical
      // repository evidence (business navigation lookups) lives. The other
      // two minimal profiles stay stripped down for latency.
      organizationSummary: contextProfile === "business_light" ? input.organizationSummary : undefined,
    });
    logGatewayLatency(latencyId, latencyStartAt, "prompt_render_done");
    logGatewayLatency(latencyId, latencyStartAt, "openai_stream_create_start", { providerName });
    const baseHandle = providerName === "openai"
      ? createOpenAiStream({ systemPrompt: renderedPrompt.systemPrompt, userMessage: input.userMessage, context: emptyProviderMemoryContext(memoryContext), metadata: { organizationId: input.organizationId, conversationId: input.conversationId }, history: input.conversationHistory ?? undefined })
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

  logGatewayLatency(latencyId, latencyStartAt, "canonical_projection_start");
  const projection = buildCanonicalGatewayProjection(input);
  const conversationState = buildCanonicalConversationState(
    input,
    conversationSignal,
    objectionSignal,
    outcomeSignal,
    "stream_with_ai_gateway",
  );
  logGatewayLatency(latencyId, latencyStartAt, "canonical_projection_done");

  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision: null,
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
    memoryContext: projection.memoryContext,
    organizationSummary: input.organizationSummary,
  });
  logGatewayLatency(latencyId, latencyStartAt, "prompt_render_done");

  const providerInput = {
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: emptyProviderMemoryContext(projection.memoryContext),
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
    history: input.conversationHistory ?? undefined,
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
    memoryContext: projection.memoryContext,
    collectionActionContext: projection.collectionActionContext,
    quoteContext: projection.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    conversationState,
    executiveDecisionContext: null,
    resolverDecision,
    runDeferredOperatingContextWrites: async () => undefined,
  };

  logGatewayLatency(latencyId, latencyStartAt, "stream_gateway_return");
  return {
    pre,
    textStream: observeProviderStream(streamHandle.textStream, latencyId, latencyStartAt),
    getFinalMeta: streamHandle.getFinalMeta,
  };
}

async function createMockStreamHandle(input: AiGatewayGenerateInput, systemPrompt: string, memoryContext: MemoryContext): Promise<OpenAiStreamHandle> {
  const result = await getAiProvider("mock").generateResponse({ systemPrompt, userMessage: input.userMessage, context: memoryContext, history: input.conversationHistory ?? undefined });
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
