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
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
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

  // FAZ 6 (Voice Pre-Generation Critical Path): neither generateVoice*
  // call below needs memory-update/knowledge candidates or their DB writes
  // — both only take the raw `message` string already in hand. Their only
  // consumer is the memoryUpdateCandidates count reported in the "done"
  // event (see buildFastPathStreamResponse), which isn't needed until the
  // model stream has already finished. Kick this off now so the writes run
  // concurrently with generation instead of gating its start; still fully
  // awaited (not fire-and-forget) before the response lifecycle ends, so
  // they are never skipped — see persistVoiceMemoryCandidates. sendUserMessage
  // above stays synchronous/blocking here on purpose: it is the one write
  // whose loss the existing "no confident decision yet -> blocking pipeline
  // retries sendUserMessage from scratch" fallback (see the OPENAI_API_KEY
  // check above) can no longer safely cover once generation has started.
  const memoryCandidatePromise = persistVoiceMemoryCandidates({
    requestId,
    requestStartAt,
    organizationId: authContext.organization.id,
    actorUserId: authContext.user.id,
    sourceMessageId: userMessage.id,
    message,
    activeMemoryItems,
  });
  // buildFastPathStreamResponse doesn't await this until after the model
  // stream has fully drained (possibly several seconds from now) — attach a
  // no-op catch so a rejection in the meantime never surfaces as unhandled
  // before then. Same idiom as classifyPromise/learningLoopPromise above and
  // in route.ts; the original reference's real rejection still propagates
  // to that later await.
  memoryCandidatePromise.catch(() => undefined);

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
          previousAiMessageContent: previousAiMessageContent || undefined,
        });

  const nextConversationState = computeNextConversationState(
    continuityResult.outcome,
    previousConversationState,
  );

  return buildFastPathStreamResponse({
    requestId,
    requestStartAt,
    profiler,
    organizationId: authContext.organization.id,
    conversation,
    message,
    fastStream,
    fastPathMode: continuityResult.outcome,
    memoryCandidatePromise,
    nextConversationState,
  });
}

// A voice fast-path "new_topic" turn skips the blocking pipeline's phase
// engine (executive-conversation-engine.service.ts), which is the only place
// that recomputes clarifyingQuestion/commitmentRequest — every one of its
// branches defaults both to null and only sets one when actively producing
// it for the CURRENT turn. Durable fields (phase, lastRecommendationTitle/
// Rationale, lastObjectionType, objectionCount, isRevisionRequired, the
// commitment-tracking fields, and mindState) are instead carried forward
// from previousState in that same engine, so a topic shift must not clear
// them either — only the two turn-scoped prompt fields are reset here.
export function preserveExecutiveStateOnTopicShift(
  previousConversationState: ExecutiveConversationState | null,
): ExecutiveConversationState | null {
  if (!previousConversationState) return null;
  return {
    ...previousConversationState,
    clarifyingQuestion: null,
    commitmentRequest: null,
    updatedAt: new Date().toISOString(),
  };
}

export function computeNextConversationState(
  outcome: "continuity" | "new_topic",
  previousConversationState: ExecutiveConversationState | null,
): ExecutiveConversationState | null {
  if (outcome === "continuity" && previousConversationState) {
    return { ...previousConversationState, updatedAt: new Date().toISOString() };
  }
  return preserveExecutiveStateOnTopicShift(previousConversationState);
}

function buildMemorySnapshotLines(activeMemoryItems: MemoryItemResult[]): string[] {
  return activeMemoryItems
    .slice(0, MEMORY_SNAPSHOT_MAX_ITEMS)
    .map((item) => `${item.key}: ${item.value}`);
}

type PersistVoiceMemoryCandidatesInput = {
  requestId: string;
  requestStartAt: number;
  organizationId: string;
  actorUserId: string;
  sourceMessageId: string;
  message: string;
  activeMemoryItems: MemoryItemResult[];
};

// Runs concurrently with the model stream (see tryVoiceFastPath) instead of
// gating its start — neither generation call needs these candidates, only
// the count reported in the "done" event does. Still fully awaited (in
// buildFastPathStreamResponse, right before that event is built) before the
// response lifecycle ends, so the writes themselves are never skipped.
async function persistVoiceMemoryCandidates(
  input: PersistVoiceMemoryCandidatesInput,
): Promise<number> {
  const {
    requestId,
    requestStartAt,
    organizationId,
    actorUserId,
    sourceMessageId,
    message,
    activeMemoryItems,
  } = input;

  logChatLatency(requestId, requestStartAt, "voice_v4_memory_candidate_start");

  const memoryUpdateCandidates = await createDeterministicUpdateCandidates({
    organizationId,
    createdByUserId: actorUserId,
    sourceMessageId,
    message,
    activeMemoryItems,
  });

  try {
    const knowledgeDetections = detectExecutiveKnowledge({ message });
    if (knowledgeDetections.length > 0) {
      const knowledgeCandidates = mapKnowledgeDetectionsToMemoryCandidates({
        detections: knowledgeDetections,
        organizationId,
        createdByUserId: actorUserId,
        sourceMessageId,
      });
      await createMissingMemoryCandidates({
        organizationId,
        createdByUserId: actorUserId,
        candidates: knowledgeCandidates,
      });
    }
  } catch (error) {
    console.warn("[VoiceV4][KnowledgeAcquisition] detection/memory candidate flow failed:", error);
  }

  logChatLatency(requestId, requestStartAt, "voice_v4_memory_candidate_done");

  return memoryUpdateCandidates.created.length;
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
  memoryCandidatePromise: Promise<number>;
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
    memoryCandidatePromise,
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

        // By this point the model stream has already fully drained, so this
        // background write (started back in tryVoiceFastPath, concurrently
        // with generation) has almost certainly already settled — this await
        // is expected to resolve immediately, not to introduce a new wait.
        // A failure here does not affect finalContent/the "done" event
        // already being sent normally; it only affects the reported count,
        // matching the existing tolerant handling immediately below it.
        let memoryUpdateCandidatesCount = 0;
        try {
          memoryUpdateCandidatesCount = await memoryCandidatePromise;
        } catch (error) {
          console.warn("[VoiceV4][UserTurnPersist] memory candidate persistence failed:", error);
        }

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
