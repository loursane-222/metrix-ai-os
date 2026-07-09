import type { Prisma } from "@prisma/client";

import { findLastAiMessageByConversation } from "@/lib/core/conversations/conversation.repository";
import type { ConversationResult } from "@/lib/core/conversations/conversation.types";
import {
  sendAiMessage,
  sendUserMessage,
} from "@/lib/application/conversations/conversation.service";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type { ManagerAdviceAnalysis } from "@/lib/manager-advice/manager-advice-orchestrator.types";
import { detectExecutiveGap } from "@/lib/manager-advice/executive-gap-detector.service";
import {
  createDeterministicUpdateCandidates,
  createMissingMemoryCandidates,
} from "@/lib/memory/candidate-engine.service";
import { detectExecutiveKnowledge } from "@/lib/knowledge/executive-knowledge-acquisition-engine.service";
import { mapKnowledgeDetectionsToMemoryCandidates } from "@/lib/knowledge/executive-knowledge-candidate-mapper.service";
import { detectConversationContinuity } from "@/lib/conversation-understanding";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { sanitizeExecutiveManagerResponse } from "@/lib/ai/executive-presence-layer";
import {
  generateVoiceContinuityResponse,
  generateVoiceFastPresenceResponse,
  type VoiceFastStreamHandle,
} from "@/lib/ai/voice-fast-response.service";
import type { RequestProfiler } from "@/lib/ai/performance/request-profiler";
import {
  buildTechnicalRepairUnavailableMessage,
  extractConversationState,
  logChatLatency,
} from "./chat-shared";

// Voice V4 Faz 1 — Fast Presence + Conversation Continuity orchestration.
//
// Returning null means "no confident fast-path decision could be made";
// the caller (route.ts) then falls through, untouched, into the existing
// blocking pipeline (full classifyConversation -> Executive Brain ->
// Operating Context) exactly as it runs for the text channel today. This
// is the safety net: every early-exit below happens BEFORE any content has
// been generated or streamed, so falling back never produces a duplicate or
// partial response.
//
// Once a fast path is chosen and streaming has started, there is no
// fallback — the Response object is already committed. Sanitization issues
// discovered after the full response is assembled are handled by swapping
// the persisted/done-event content, not by aborting the stream (mirrors
// how the existing blocking pipeline already handles the same edge case:
// audio for a voice turn is scheduled from raw streamed chunks before
// sanitization ever runs on the final text).

const MEMORY_SNAPSHOT_MAX_ITEMS = 8;

export type TryVoiceFastPathInput = {
  requestId: string;
  requestStartAt: number;
  profiler: RequestProfiler;
  authContext: AuthContext;
  conversation: ConversationResult;
  conversationId: string | undefined;
  message: string;
  organizationSummary: string;
  managerAdviceAnalysis: ManagerAdviceAnalysis;
  activeMemoryItems: MemoryItemResult[];
  classifyPromise: Promise<ConversationUnderstanding>;
};

export async function tryVoiceFastPath(
  input: TryVoiceFastPathInput,
): Promise<Response | null> {
  const {
    requestId,
    requestStartAt,
    profiler,
    authContext,
    conversation,
    conversationId,
    message,
    organizationSummary,
    managerAdviceAnalysis,
    activeMemoryItems,
    classifyPromise,
  } = input;

  // Existing safety net (readiness gap -> clarifying question instead of a
  // guess). Cheap and local; unrelated to classifyConversation/Executive
  // Brain. Deferring to the blocking pipeline for a gap hit keeps its
  // existing response shape/behavior completely unchanged for Faz 1 — see
  // report for why this is not folded into the fast path here.
  const gapResult = detectExecutiveGap({ message, analysis: managerAdviceAnalysis });
  if (gapResult.hasGap) {
    return null;
  }

  const lastAiMessage = conversationId
    ? await findLastAiMessageByConversation(conversation.id)
    : null;
  const previousConversationState = extractConversationState(lastAiMessage?.metadata);
  const previousAiMessageContent = lastAiMessage?.content ?? "";

  logChatLatency(requestId, requestStartAt, "voice_v4_continuity_check_start");
  const continuityResult = detectConversationContinuity({
    message,
    previousConversationState,
    hasPreviousAiMessage: previousAiMessageContent.trim().length > 0,
  });
  logChatLatency(requestId, requestStartAt, "voice_v4_continuity_check_done", {
    outcome: continuityResult.outcome,
    confidence: continuityResult.confidence,
  });

  if (continuityResult.outcome === "ambiguous") {
    return null;
  }

  // Checked before any write happens: generateVoice*Response() below throws
  // synchronously if this is missing. Bailing out here (before
  // sendUserMessage) keeps the "no confident decision yet" contract intact
  // — if this function returns null, the blocking pipeline below re-runs
  // its own sendUserMessage from scratch. Throwing after that write would
  // instead cause a duplicate user message once the caller's try/catch
  // falls through to the blocking pipeline.
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  logChatLatency(requestId, requestStartAt, "voice_v4_fast_path_selected", {
    mode: continuityResult.outcome,
  });

  const userMessage = await sendUserMessage({
    organizationId: authContext.organization.id,
    conversationId: conversation.id,
    actorUserId: authContext.user.id,
    content: message,
  });

  const memoryUpdateCandidates = await createDeterministicUpdateCandidates({
    organizationId: authContext.organization.id,
    createdByUserId: authContext.user.id,
    sourceMessageId: userMessage.id,
    message,
  });

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
    console.warn("[VoiceV4][KnowledgeAcquisition] detection/memory candidate flow failed:", error);
  }

  // Full classification/Executive Brain reasoning is intentionally not
  // awaited here. It was already kicked off (non-blocking) by the caller
  // before this function ran; consuming its result is deferred to a later
  // phase (see report "sonraki faz"). Attach a no-op catch only so an
  // eventual rejection never surfaces as an unhandled promise rejection.
  classifyPromise.catch(() => undefined);

  logChatLatency(requestId, requestStartAt, "voice_v4_first_generation_start", {
    mode: continuityResult.outcome,
  });

  const fastStream: VoiceFastStreamHandle =
    continuityResult.outcome === "continuity"
      ? generateVoiceContinuityResponse({
          userMessage: message,
          previousAiMessageContent,
          previousConversationState,
          transformationKind: continuityResult.transformationKind,
        })
      : generateVoiceFastPresenceResponse({
          userMessage: message,
          organizationSummary,
          memorySnapshotLines: buildMemorySnapshotLines(activeMemoryItems),
        });

  const nextConversationState =
    continuityResult.outcome === "continuity" && previousConversationState
      ? { ...previousConversationState, updatedAt: new Date().toISOString() }
      : null;

  return buildFastPathStreamResponse({
    requestId,
    requestStartAt,
    profiler,
    organizationId: authContext.organization.id,
    conversation,
    message,
    fastStream,
    fastPathMode: continuityResult.outcome,
    memoryUpdateCandidatesCount: memoryUpdateCandidates.created.length,
    nextConversationState,
  });
}

function buildMemorySnapshotLines(activeMemoryItems: MemoryItemResult[]): string[] {
  return activeMemoryItems
    .slice(0, MEMORY_SNAPSHOT_MAX_ITEMS)
    .map((item) => `${item.key}: ${item.value}`);
}

function buildFastPathStreamResponse(params: {
  requestId: string;
  requestStartAt: number;
  profiler: RequestProfiler;
  organizationId: string;
  conversation: ConversationResult;
  message: string;
  fastStream: VoiceFastStreamHandle;
  fastPathMode: "continuity" | "new_topic";
  memoryUpdateCandidatesCount: number;
  nextConversationState: ReturnType<typeof extractConversationState> | null;
}): Response {
  const {
    requestId,
    requestStartAt,
    profiler,
    organizationId,
    conversation,
    message,
    fastStream,
    fastPathMode,
    memoryUpdateCandidatesCount,
    nextConversationState,
  } = params;

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let loggedFirstChunk = false;
        for await (const chunk of fastStream.textStream) {
          if (!loggedFirstChunk) {
            loggedFirstChunk = true;
            logChatLatency(requestId, requestStartAt, "voice_v4_first_upstream_chunk_received");
          }
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "chunk", content: chunk }) + "\n"),
          );
        }

        const rawContent = await fastStream.getFinalContent();
        const sanitization = sanitizeExecutiveManagerResponse({
          content: rawContent,
          userMessage: message,
        });
        const finalContent = sanitization.needsRepair
          ? buildTechnicalRepairUnavailableMessage()
          : sanitization.content;

        const memoryContextSummary: Prisma.InputJsonObject = {
          version: "voice_fast",
          totalIncluded: 0,
          highlights: 0,
          facts: 0,
          processes: 0,
          strategic: 0,
          preferences: 0,
          conflicts: 0,
        };

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "done",
              conversationId: conversation.id,
              ai: {
                content: finalContent,
                provider: "openai",
                model: fastStream.model,
                memoryContextSummary,
                memoryUpdateCandidates: memoryUpdateCandidatesCount,
                metadata: {
                  voiceFastPath: true,
                  voiceFastPathMode: fastPathMode,
                },
              },
            }) + "\n",
          ),
        );
        logChatLatency(requestId, requestStartAt, "done_event_sent", {
          voiceFastPathMode: fastPathMode,
        });

        await sendAiMessage({
          organizationId,
          conversationId: conversation.id,
          content: finalContent,
          metadata: {
            provider: "openai",
            model: fastStream.model,
            voiceFastPath: true,
            voiceFastPathMode: fastPathMode,
            memoryContextSummary,
            memoryUpdateCandidates: [],
            usage: null,
            costTracking: null,
            rawResponseId: null,
            conversationState: nextConversationState ?? null,
          },
        });

        profiler.markEnd("route_total");
        profiler.finish();
        controller.close();
      } catch (err: unknown) {
        profiler.markEnd("route_total");
        profiler.finish();
        logChatLatency(requestId, requestStartAt, "stream_error", {
          errorName: err instanceof Error ? err.name : typeof err,
          voiceFastPathMode: fastPathMode,
        });
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            }) + "\n",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
  });
}
