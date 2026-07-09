// Conversation Rhythm Engine — decides HOW a piece of Executive Brain output
// is delivered (style, pacing, emphasis), as a layer distinct from Voice
// Engine (executes delivery as scheduled audio) and Presence Engine (renders
// state signals). This file is the V1 foundation only: it takes over the
// delivery-classification responsibility that used to live in
// speechPlanner.ts and gives it a permanent home and an explicit contract.
//
// V1 makes no pacing, pause, or backchannel decisions yet — DeliveryDirective
// reserves fields for that, but nothing populates them today. Behaviorally,
// this file's output is identical to what speechPlanner.planSentenceDelivery
// produced before this phase. Later phases extend classifyStyleHint /
// RhythmContext; they should not need to change the call sites in
// useVoiceExperienceOrchestrator.ts or the shape Voice Engine consumes.
//
// No LLM calls here, ever — the same constraint speechPlanner.ts's
// segmentation functions operate under: the first-audio latency budget
// leaves no room for a round trip, so every decision here must stay
// synchronous.

export type TtsStyleHint = "question" | "decision" | "risk" | "neutral";

// The contract between Rhythm Engine and its consumers. Voice Engine
// (useVoiceTtsQueue) reads `text` + `styleHint` today. pauseBeforeMs /
// pauseAfterMs / pacing / emphasis are reserved for later phases — declared
// now so the contract's shape doesn't change again once they're populated.
export type DeliveryDirective = {
  text: string;
  styleHint: TtsStyleHint;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  pacing?: "slow" | "normal" | "fast";
  emphasis?: Array<{ word: string; strength: "light" | "strong" }>;
};

// Per-sentence input the engine reasons over. Only `text` is populated by
// any caller today. Turn-level or session-level observations (presence
// state, playback position, turn count) are deliberately not declared here —
// adding unused fields ahead of a real decision that reads them would be
// speculative. Extend this type when a later phase adds a decision that
// actually consumes the extra context.
export type RhythmContext = {
  text: string;
};

const DECISION_KEYWORDS = /\b(öner|tavsiye|karar|yapmalıyız|önerim|kararım|yapalım)/i;
const RISK_KEYWORDS = /\b(risk|dikkat|tehlike|kayıp|sorun|endişe)/i;

// Contract-enforcement only: strips markdown artifacts that should never
// reach TTS (voice prompt already instructs the model not to produce them).
// Does not reword, trim meaning, or "clean up" otherwise valid prose.
function stripMarkdownArtifacts(text: string): string {
  return text
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}

function classifyStyleHint(text: string): TtsStyleHint {
  if (/[?]\s*$/.test(text.trim())) return "question";
  if (RISK_KEYWORDS.test(text)) return "risk";
  if (DECISION_KEYWORDS.test(text)) return "decision";
  return "neutral";
}

// Single entry point: given a raw sentence from Executive Brain output,
// decide how it should be delivered. This is the seam Voice Engine calls
// through instead of reasoning about delivery itself.
export function planDelivery(context: RhythmContext): DeliveryDirective {
  const text = stripMarkdownArtifacts(context.text);
  return {
    text,
    styleHint: classifyStyleHint(text),
  };
}

// Turn-opening ack policy: how long the orchestrator may wait for a filler
// ack's text before abandoning it in favor of the real response. Owned here
// rather than as a private orchestrator constant because it's a
// delivery-timing decision, the same kind this engine already makes for
// per-sentence style. The budget is deliberately smaller than "give the ack
// a full second" would suggest: TTS synthesis for the ack text still has to
// happen after this budget elapses (~400-700ms observed), so keeping the
// text budget itself tight is what keeps total time-to-first-audible-ack
// close to the ~1s target instead of stacking on top of it.
const ACK_TEXT_BUDGET_MS = 550;

export type TurnOpeningPlan = {
  ackTimeoutMs: number;
};

// Entry point for turn-start policy. No IO, no LLM call — same constraint as
// planDelivery. Returns a static budget today; a later phase may make this
// conditional on session/context state without changing the call site.
export function planTurnOpening(): TurnOpeningPlan {
  return { ackTimeoutMs: ACK_TEXT_BUDGET_MS };
}
