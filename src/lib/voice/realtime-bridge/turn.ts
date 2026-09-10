import { latencyMark } from "./latency";
import { createMetrixOpeningStream, deliverOpeningSentences, isSafeVoiceAcknowledgement } from "@/app/api/ai/chat/opening-delivery";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { classifyConversation } from "@/lib/conversation-understanding";
import { runExecutiveAgent } from "@/lib/executive-agent/runtime";
import { createContinuityGuard } from "@/lib/executive-agent/continuity-guard";
import {
  resolveExecutiveConversation, prepareExecutiveTurnContext, loadExecutiveConversationHistory,
  buildExecutiveConversationHistory, buildOrganizationSummary, persistCanonicalUserTurn, persistCanonicalAssistantTurn,
} from "@/lib/executive-agent/turn-lifecycle";
import type { ProgressiveChunk } from "@/lib/executive-agent/progressive-delivery";
import { verifyBridgeSession } from "./session";

export type BridgeTurnInput = { sessionToken: string; sessionId: string; conversationId: string; turnId: string; generation: number; transcript: string };
export type BridgeSpeechEvent = {
  sessionId: string; conversationId: string; turnId: string; generation: number;
  type: "chunk"; phase: "opening" | "primary"; content: string; sequence: number;
  progressive?: ProgressiveChunk;
};
export async function metrixExecutiveTurn(auth: AuthContext, input: BridgeTurnInput, signal: AbortSignal, emit?: (event: BridgeSpeechEvent) => void) {
  const binding = verifyBridgeSession(input.sessionToken, auth);
  if (binding.sessionId !== input.sessionId || binding.conversationId !== input.conversationId) throw new Error("Bridge binding mismatch");
  signal.throwIfAborted();
  const conversation = await resolveExecutiveConversation({ organizationId: auth.organization.id, userId: auth.user.id, conversationId: binding.conversationId, message: input.transcript });
  if (!conversation) throw new Error("Conversation unavailable");
  const envelope = { sessionId: binding.sessionId, conversationId: conversation.id, turnId: input.turnId, generation: input.generation };
  // Natural Reaction never routes the turn and never owns Company Truth.
  // Let the canonical opening model decide semantically whether a reaction
  // is appropriate; semantic classification continues independently.
  const earlyNaturalReaction = Boolean(emit && input.transcript.trim());
  const openingAbort = new AbortController();
  let sequence = 0, primaryPublished = false;
  const publish = (content: string, phase: "opening" | "primary", progressive?: ProgressiveChunk) => {
    signal.throwIfAborted();
    emit?.({ ...envelope, type: "chunk", content, phase, progressive, sequence: ++sequence });
    if (emit && phase === "opening") latencyMark("server", input.turnId, "opening_sentence_delivered");
    if (emit && phase === "primary" && !primaryPublished) {
      primaryPublished = true;
      latencyMark("server", input.turnId, "first_progressive_publish");
    }
  };
  // Natural Conversational Continuity operation: same deterministic safety
  // net as the text channel (route.ts) — see continuity-guard.ts and the
  // matching comment there for why this is tied ONLY to the whole-turn
  // `signal`, never to `openingAbort` (proven live: openingAbort fires as
  // soon as the primary phase is decided, which can be tens of seconds
  // before real content actually starts for a slow action/mutation turn —
  // tying the guard to it would silence it exactly when needed most).
  // Reuses the same "opening" phase/publish path, so it is spoken through
  // the existing TTS queue with zero new voice-delivery machinery.
  const continuityGuard = createContinuityGuard({
    signal,
    speak: (sentence) => publish(sentence, "opening"),
  });
  const startOpening = () => {
    const openingSignal = AbortSignal.any([signal, openingAbort.signal, AbortSignal.timeout(2500)]);
    void (async () => {
      try {
        latencyMark("server", input.turnId, "opening_start");
        const opening = createMetrixOpeningStream({ organizationId: auth.organization.id,
          conversationId: conversation.id, message: input.transcript, channel: "voice", signal: openingSignal,
          voiceAcknowledgement: true });
        await deliverOpeningSentences({ textStream: opening.textStream, signal: openingSignal,
          onFirstOutput: () => {
            console.info("[voice-reaction-diag]", {
              turnId: input.turnId,
              event: "model_first_output",
              monotonicMs: performance.now(),
            });
          }, publish: sentence => {
            const safe = isSafeVoiceAcknowledgement(sentence);
            console.info("[voice-reaction-diag]", {
              turnId: input.turnId,
              event: "complete_sentence",
              safe,
              aborted: openingSignal.aborted,
              monotonicMs: performance.now(),
            });
            if (openingSignal.aborted || !safe) return;
            continuityGuard.markActivity();
            publish(sentence, "opening");
            openingAbort.abort(); // one canonical sentence
          } });
        console.info("[voice-reaction-diag]", {
          turnId: input.turnId,
          event: "delivery_finished",
          aborted: openingSignal.aborted,
          monotonicMs: performance.now(),
        });
      } catch (error) {
        console.info("[voice-reaction-diag]", {
          turnId: input.turnId,
          event: "opening_failed",
          aborted: openingSignal.aborted,
          errorName: error instanceof Error ? error.name : typeof error,
          monotonicMs: performance.now(),
        });
        /* Optional opening failure, including cancellation, is contained. */
      }
    })();
  };
  try {
    if (earlyNaturalReaction) startOpening();
    const [, messages] = await loadExecutiveConversationHistory({ conversationId: conversation.id, organizationId: auth.organization.id, limit: 12 });
    const history = buildExecutiveConversationHistory(messages);
    latencyMark("server", input.turnId, "classification_start");
    const understanding = await classifyConversation({ message: input.transcript, recentMessages: history.map(m => `${m.role}: ${m.content}`) });
    latencyMark("server", input.turnId, "classification_complete");
    signal.throwIfAborted();
    await persistCanonicalUserTurn({ organizationId: auth.organization.id, actorUserId: auth.user.id, conversationId: conversation.id, content: input.transcript });
    // Unclear/mixed/low-confidence turns never obtain the native general bypass.
    const general = understanding.conversationKind === "general_chat" && understanding.companyRelevance === "none"
      && understanding.actionExpectation === "none" && !understanding.shouldInvokeExecutiveBrain
      && understanding.suggestedHandling === "answer_only" && understanding.confidence === "high"
      && !understanding.businessNavigation && !understanding.artifactRequest;
    if (general) return { ...envelope, mode: "GENERAL" as const };
    const runContext = prepareExecutiveTurnContext({ authContext: auth, channel: "voice", conversationId: conversation.id,
      requestId: input.turnId, correlationId: binding.sessionId, message: input.transcript,
      activeDocumentAttachment: null, activeWorkspaceContext: null });
    const contextualEntry = "";

    const concurrentOpening = earlyNaturalReaction;
    const progressive: { text: string; frame: ProgressiveChunk }[] = [];
    signal.throwIfAborted();
    latencyMark("server", input.turnId, "executive_start");
    const result = await runExecutiveAgent(runContext, { message: input.transcript, conversationHistory: history,
      organizationSummary: buildOrganizationSummary(auth.organization), contextualEntry, concurrentOpening, signal }, (text, frame) => {
      signal.throwIfAborted();
      // Never insert a late opening after grounded speech has begun.
      openingAbort.abort();
      if (text.trim()) continuityGuard.markActivity();
      if (frame) progressive.push({ text, frame });
      publish(text, "primary", frame);
    });
    openingAbort.abort();
    signal.throwIfAborted();
    if (result.stopReason !== "completed") throw new Error("Executive turn did not complete");
    latencyMark("server", input.turnId, "executive_complete");
    await persistCanonicalAssistantTurn({ organizationId: auth.organization.id, conversationId: conversation.id,
      content: result.text, metadata: { voiceBridge: true, sessionId: binding.sessionId, turnId: input.turnId, generation: input.generation } });
    signal.throwIfAborted();
    return { ...envelope, mode: "COMPANY" as const, executiveResult: result.text,
      structured: result.structured, progressive, clientAction: result.clientAction, deliverableArtifact: result.deliverableArtifact };
  } finally {
    openingAbort.abort();
  }
}
