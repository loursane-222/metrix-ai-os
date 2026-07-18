"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useVoiceChatConnection } from "../useVoiceChatConnection";
import { useVoiceTtsQueue, type SentenceTiming } from "../useVoiceTtsQueue";
import { useExecutivePresenceVoiceListeningProducer } from "@/components/executive-presence/useExecutivePresenceVoiceListeningProducer";
import { extractSentences, endsWithTerminalPunctuation, extractEarlyClauseSegment } from "./speechPlanner";
import { planDelivery, planTurnOpening } from "./rhythmEngine";
import { deriveTurnOwner, type TurnOwner } from "./turnOwnership";
import { isVoiceNativeRealtimeEnabled } from "@/lib/voice/voice-native-realtime-flag";

// Diagnostic-only: mirrors every [VoiceLatency] log into a page-lifetime
// global array so it can be read back from the browser console even when
// scrollback misses an entry. Timing and numeric identifiers only — never
// user text, prompts, tokens, or other content (same rule as the console
// logs themselves). Reset happens naturally on full page load, since this
// module (and `window`) is re-evaluated fresh at that point; the guard below
// only prevents a second copy of this module re-creating the array on HMR.
type VoiceLatencyPayload = Record<string, number | string | boolean | undefined>;

declare global {
  interface Window {
    __voiceLatencyLogs?: VoiceLatencyPayload[];
    __printVoiceLatencyReport?: () => void;
  }
}

if (typeof window !== "undefined" && !window.__voiceLatencyLogs) {
  window.__voiceLatencyLogs = [];
}

function logVoiceLatency(payload: VoiceLatencyPayload): void {
  console.info("[VoiceLatency]", payload);
  if (typeof window !== "undefined") {
    window.__voiceLatencyLogs?.push(payload);
  }
}

// FAZ 5 (First Response Latency Trace) — diagnostic-only, read-only. Prints
// every recorded [VoiceLatency] mark across all voice-chain files (this
// hook, useVoiceChatConnection, useVoiceTtsQueue — they all push into the
// same window.__voiceLatencyLogs array) as one chronological table. turnId
// groups marks between consecutive "speech_stopped" events, since that is
// the one mark every file's turn-local clock (turnGenerationRef here,
// useVoiceTtsQueue's own `generation`) agrees is the start of a new turn —
// see useVoiceTtsQueue's SentenceTiming comment for why cross-file marks are
// correlated by shared `at` (performance.now()) rather than by forcing a
// single numeric id across hooks. Call manually from the browser console:
// window.__printVoiceLatencyReport(). Never call this automatically — it
// exists purely for the FAZ 5 measurement pass.
function printVoiceLatencyReport(): void {
  const logs = typeof window !== "undefined" ? window.__voiceLatencyLogs ?? [] : [];
  if (logs.length === 0) {
    console.info("[VoiceLatency] no marks recorded yet.");
    return;
  }

  const sorted = [...logs].sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));
  let turnId = 0;
  let speechStoppedAt: number | null = null;
  let previousAt: number | null = null;

  const rows = sorted.map((entry) => {
    const at = Number(entry.at ?? 0);
    if (entry.label === "speech_stopped") {
      turnId += 1;
      speechStoppedAt = at;
    }
    const row = {
      turnId,
      event: entry.label,
      timestampMs: Math.round(at),
      deltaFromPreviousMs: previousAt === null ? null : Math.round(at - previousAt),
      deltaFromSpeechStoppedMs: speechStoppedAt === null ? null : Math.round(at - speechStoppedAt),
    };
    previousAt = at;
    return row;
  });

  console.table(rows);
}

if (typeof window !== "undefined") {
  window.__printVoiceLatencyReport = printVoiceLatencyReport;
}

// Single timeline authority for voice turns. Composes the WebRTC connection
// (listening / transcription) and the TTS queue (audio scheduling) and owns
// the one thing neither of them owns on its own: what the user should see
// and hear as a single, synchronized experience.
//
// Text reveal for voice turns is driven from the same AudioContext clock
// that schedules audio (via useVoiceTtsQueue's onSentenceScheduled), not a
// fixed-rate timer — this is what keeps text and voice from drifting.

// While a sentence's stream is still draining, endAt only reflects audio
// scheduled so far — it understates the true duration. Capping reveal below
// 100% until SentenceTiming.isFinal arrives prevents text from finishing a
// sentence before its audio actually does.
const PENDING_SENTENCE_REVEAL_CAP = 0.92;

// Final Fix — Native Voice Runtime transcript pacing. Root cause: the
// Realtime API's response.output_audio_transcript.delta stream generates
// far faster than the corresponding spoken audio (LLM/transcript token
// generation vs. real speech duration — the same fundamental gap the TTS
// path's startRevealLoop/PENDING_SENTENCE_REVEAL_CAP above already exists to
// paper over for sentence-scheduled audio). Without pacing, revealedText
// jumps to the full response almost immediately while the audio track keeps
// playing for several more seconds — "text appears, then Metrix reads it"
// instead of "text grows with speech." There is no per-turn audio-duration
// signal available for a live/continuous native audio track the way the TTS
// path has each sentence's [startAt,endAt) AudioContext window up front, so
// this uses a bounded reveal RATE instead — the same idea
// MetrixChatTab.tsx's own startTypingInterval already uses for the
// text-channel streaming effect, applied here to the native voice channel.
const NATIVE_REVEAL_CHARS_PER_TICK = 2;
const NATIVE_REVEAL_TICK_MS = 24;

// Pure — computes the next paced-reveal string. Exported for unit testing
// without timers/React. Never reveals past targetText's current length
// (there is nothing to show yet beyond what's actually been generated), and
// is a no-op once shownText has caught up.
export function advanceNativeReveal(
  shownText: string,
  targetText: string,
  charsPerTick: number,
): string {
  if (shownText.length >= targetText.length) return shownText;
  const nextLength = Math.min(targetText.length, shownText.length + charsPerTick);
  return targetText.slice(0, nextLength);
}

export function clearNativeRevealTimer(
  timer: ReturnType<typeof setInterval> | null,
): null {
  if (timer !== null) clearInterval(timer);
  return null;
}

// Self-echo guard: while Metrix's own TTS audio plays, the mic can pick up
// enough of it (imperfect echo cancellation, especially over speakers) for
// the realtime API to report it as user speech. Rather than trust VAD alone,
// any candidate transcript arriving while Metrix speaks is compared against
// what she is actually saying — a signal we already know exactly, since we
// generated it. Only genuinely divergent speech is treated as a real
// interruption.
const MIN_ECHO_CHECK_CHARS = 6;
const ECHO_WORD_OVERLAP_THRESHOLD = 0.6;

function normalizeForEchoCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Word-boundary-aware: does referenceWords contain candidateWords as a
// contiguous run? A raw string.includes() would let "dur" false-match
// inside "durumu" or "duruyor" — exactly the short words a user is most
// likely to say to interrupt, and exactly what candidateWords.length === 1
// makes common.
function containsWordSequence(referenceWords: string[], candidateWords: string[]): boolean {
  if (candidateWords.length === 0 || candidateWords.length > referenceWords.length) return false;
  for (let start = 0; start <= referenceWords.length - candidateWords.length; start++) {
    let matches = true;
    for (let offset = 0; offset < candidateWords.length; offset++) {
      if (referenceWords[start + offset] !== candidateWords[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function isLikelySelfEcho(candidate: string, reference: string): boolean {
  const normCandidate = normalizeForEchoCompare(candidate);
  const normReference = normalizeForEchoCompare(reference);
  if (!normCandidate || !normReference) return false;

  const candidateWords = normCandidate.split(" ").filter(Boolean);
  const referenceWords = normReference.split(" ").filter(Boolean);
  if (candidateWords.length === 0) return false;

  if (containsWordSequence(referenceWords, candidateWords)) return true;

  const referenceWordSet = new Set(referenceWords);
  const overlap = candidateWords.filter((word) => referenceWordSet.has(word)).length;
  return overlap / candidateWords.length > ECHO_WORD_OVERLAP_THRESHOLD;
}

// Short, explicit stop commands. These are never something Metrix would say
// herself (her generated speech is full executive sentences, never a bare
// isolated imperative), so an exact match is treated as unambiguous
// interruption intent regardless of transcription quality — it must not
// wait for the length-gated divergence check below, and must not be
// forwarded to the brain as a new question once recognized.
const INTERRUPT_COMMAND_PHRASES = new Set([
  "dur",
  "kes",
  "bekle",
  "hayır",
  "bir saniye",
  "bir dakika",
]);

function isInterruptCommand(text: string): boolean {
  return INTERRUPT_COMMAND_PHRASES.has(normalizeForEchoCompare(text));
}

const GENERIC_ACKNOWLEDGEMENT_WORDS = new Set([
  "çok",
  "teşekkürler",
  "teşekkür",
  "ederim",
  "sağol",
  "sağolun",
  "tamam",
  "peki",
  "anladım",
]);

function isShortGenericAcknowledgement(text: string): boolean {
  const words = normalizeForEchoCompare(text).split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every((word) =>
    GENERIC_ACKNOWLEDGEMENT_WORDS.has(word),
  );
}

export type BargeInTranscriptDecision =
  | "interrupt_command"
  | "self_echo"
  | "suspicious"
  | "insufficient"
  | "user_speech";

// One validation gate for interim and final transcripts. A short generic
// acknowledgement is suppressed only while native assistant audio is
// active; the same words said while listening remain a normal user turn.
export function classifyBargeInTranscript(params: {
  candidate: string;
  spokenReference: string;
  nativeAssistantActive: boolean;
  isFinal: boolean;
}): BargeInTranscriptDecision {
  const trimmed = params.candidate.trim();
  if (!trimmed) return "insufficient";
  if (isInterruptCommand(trimmed)) return "interrupt_command";
  if (isLikelySelfEcho(trimmed, params.spokenReference)) return "self_echo";
  if (params.nativeAssistantActive && isShortGenericAcknowledgement(trimmed)) {
    return "suspicious";
  }
  if (!params.isFinal && normalizeForEchoCompare(trimmed).length < MIN_ECHO_CHECK_CHARS) {
    return "insufficient";
  }
  return "user_speech";
}

export function shouldInterruptOnSpeechStarted(presenceKind: VoicePresence["kind"]): boolean {
  // While audio is playing, VAD alone cannot distinguish a user from speaker
  // echo. Thinking has no assistant audio to echo, so it remains immediately
  // interruptible exactly as before.
  return presenceKind === "thinking";
}

// Self-echo lifecycle fix — Native Voice Runtime. Root cause: interrupt()
// used to clear nativeAssistantTranscriptRef immediately (via
// resetTurnState()), but the same interrupted utterance's own final
// transcript (STT) routinely arrives late, AFTER that clear. With no
// reference left to compare against, currentSpokenReference() returned ""
// for that late transcript, isLikelySelfEcho could never match (it always
// returns false against an empty reference — see its own guard), and the
// echoed text was then treated as a brand-new user turn: beginTurn() fired
// ("Metrix düşünüyor" reappeared mid-response), a spurious/short user
// message was posted, and no real answer followed. The fix: interrupt()
// preserves a snapshot (pendingInterruptedTranscriptRef) of what was
// actually being said, and this one late transcript is checked against it
// before falling through to beginTurn()/send(). Genuinely new speech is
// unaffected — it doesn't match the preserved reference and proceeds
// exactly as before.

// Pure — mirrors currentSpokenReference's native-mode branch so it can be
// unit-tested without rendering the hook. `nativeAssistantTranscript` wins
// while a response is actually in flight; `pendingInterruptedTranscript`
// (the snapshot interrupt() preserved) is the fallback once that's been
// cleared, so a late transcript for an already-interrupted response still
// has something real to compare against instead of "".
export function resolveNativeSpokenReference(params: {
  nativeAssistantTranscript: string;
  pendingInterruptedTranscript: string;
  revealedText: string;
}): string {
  const spokenSoFar =
    params.nativeAssistantTranscript || params.pendingInterruptedTranscript;
  if (!spokenSoFar) return "";
  return `${spokenSoFar} ${params.revealedText}`.trim();
}

// Pure — the one new gate handleFinalTranscript consults. wasPending is the
// existing (unchanged) "Metrix was speaking when this utterance started"
// signal. wasRecentlyInterrupted is true only when a snapshot is still
// waiting to be consumed (see pendingInterruptedTranscriptRef) — i.e. Metrix
// was interrupted moments ago and this may be that same utterance's own
// late-arriving final transcript. Either signal, combined with a self-echo
// or suspicious-acknowledgement classification, means: discard — do not
// call beginTurn(), do not call send(), do not touch presence. A
// "user_speech" classification always falls through unchanged, so a
// genuine barge-in is never suppressed by this gate.
export function shouldDiscardFinalTranscript(params: {
  wasPending: boolean;
  wasRecentlyInterrupted: boolean;
  decision: BargeInTranscriptDecision;
}): boolean {
  return (
    (params.wasPending || params.wasRecentlyInterrupted) &&
    (params.decision === "self_echo" || params.decision === "suspicious")
  );
}

export type NativeFinalizationDecision = {
  shouldFinalize: boolean;
  commitText: string;
};

export function decideNativeFinalization(params: {
  targetText: string;
  revealedText: string;
  transcriptDone: boolean;
  responseTerminal: boolean;
  responseStatus?: string;
  alreadyCommitted: boolean;
}): NativeFinalizationDecision {
  if (params.alreadyCommitted || !params.responseTerminal) {
    return { shouldFinalize: false, commitText: "" };
  }
  if (params.responseStatus === "cancelled" || params.responseStatus === "failed") {
    return { shouldFinalize: true, commitText: params.revealedText.trim() };
  }
  if (
    !params.transcriptDone ||
    !params.targetText ||
    params.revealedText !== params.targetText
  ) {
    return { shouldFinalize: false, commitText: "" };
  }
  return { shouldFinalize: true, commitText: params.targetText };
}

// Quick executive acknowledgment: fired in parallel with the real
// Executive Brain request the moment the user finishes speaking, so the
// user hears something within roughly a second instead of dead air during
// the (measured, multi-second) classify/reason pipeline. It never
// substitutes for the real response — see beginAckRace below.
const ACK_ENDPOINT = "/api/ai/chat/voice/ack";

// A sentence's TTS fetch is scheduled into the AudioContext timeline as soon
// as its chunks are read off the network — fast, and for multi-sentence
// responses this races far ahead of real-time playback (which is bound by
// actual speech duration). "Most recently scheduled sentence" is therefore
// NOT the same thing as "sentence currently audible". This scans the
// per-sentence timing already recorded by useVoiceTtsQueue to find the one
// whose [startAt, endAt) actually contains the current AudioContext time —
// the only thing that is genuinely authoritative for both text reveal and
// self-echo comparison.
function findAudibleSentenceIndex(
  currentTime: number,
  timing: Map<number, SentenceTiming>,
): number {
  let mostRecentlyFinishedIndex = -1;
  let mostRecentlyFinishedEndAt = -Infinity;

  for (const [index, entry] of timing) {
    if (currentTime >= entry.startAt && currentTime < entry.endAt) {
      return index;
    }
    if (entry.endAt <= currentTime && entry.endAt > mostRecentlyFinishedEndAt) {
      mostRecentlyFinishedEndAt = entry.endAt;
      mostRecentlyFinishedIndex = index;
    }
  }

  // Between sentences (or before the first has started): hold on the last
  // one that actually finished playing rather than jumping ahead.
  return mostRecentlyFinishedIndex;
}

export type VoicePresence =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "listening" }
  | { kind: "userSpeaking" }
  | { kind: "thinking" }
  | { kind: "speaking"; sentenceIndex: number };

type UseVoiceExperienceOrchestratorResult = {
  presence: VoicePresence;
  turnOwner: TurnOwner;
  revealedText: string;
  isConnected: boolean;
  connectionError: string | null;
  start: () => Promise<void>;
  stop: () => void;
  beginTurn: () => void;
  onChunk: (deltaText: string) => void;
  onStreamDone: () => void;
  onStreamError: () => void;
  // Diagnostic-only: lets the host component (MetrixChatTab) add marks to
  // this turn's [VoiceLatency] timeline (e.g. chat_send_started,
  // chat_fetch_started) using the same turnId/elapsedMs clock as every
  // other mark in this file — see FAZ 5 latency trace. No-ops before
  // beginTurn() has run for this turn (see logLatencyMark's own guard).
  logLatencyMark: (label: string, extra?: Record<string, number | string | boolean | undefined>) => void;
};

export function useVoiceExperienceOrchestrator(
  onFinalTranscript: (text: string) => void,
  onInterrupt?: (revealedTextAtInterrupt: string) => void,
  // Faz 1A.2 — Native Voice Runtime. Fires exactly once per native turn that
  // completes NORMALLY (never for a barge-in — that's onInterrupt's job,
  // and it already fires for native turns too via cancelActiveResponse; see
  // handleNativeResponseLifecycle's "done" branch, which only reaches this
  // callback when hasActiveResponseRef was never cleared by a cancel). The
  // host component (MetrixChatTab.tsx) is responsible for deciding what to
  // do with the text — mirrors onInterrupt's own division of labor.
  onNativeAssistantResponseDone?: (finalText: string) => void,
): UseVoiceExperienceOrchestratorResult {
  const [presence, setPresenceState] = useState<VoicePresence>({ kind: "idle" });
  const [revealedText, setRevealedText] = useState("");
  // Mirrors `revealedText` without being a useCallback dependency anywhere —
  // interrupt() reads this synchronously to capture exactly what was audible
  // right before resetTurnState() wipes the sentence data backing it.
  const revealedTextRef = useRef("");

  // The WebRTC data channel's onmessage handler is bound once, when the
  // connection opens, and is never rebound afterward (the connection is
  // intentionally persistent across turns). Any callback reachable from
  // that handler therefore closes over a permanently stale `presence`
  // value if it reads the state variable directly. presenceRef is kept in
  // lockstep with every presence change specifically so those callbacks
  // (handleSpeechStarted) can read the live value via the ref instead.
  const presenceRef = useRef<VoicePresence>({ kind: "idle" });
  const setPresence = useCallback((next: VoicePresence) => {
    presenceRef.current = next;
    setPresenceState(next);
  }, []);
  useExecutivePresenceVoiceListeningProducer(presence.kind);

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Lets the host component abort its in-flight /api/ai/chat request the
  // instant a genuine barge-in is decided (see interrupt() below) — the
  // orchestrator has no reference to that fetch itself, only the host does.
  // Also carries the text actually revealed up to that moment so the host
  // can persist the heard-so-far partial answer before it's cleared.
  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => {
    onInterruptRef.current = onInterrupt;
  }, [onInterrupt]);

  const onNativeAssistantResponseDoneRef = useRef(onNativeAssistantResponseDone);
  useEffect(() => {
    onNativeAssistantResponseDoneRef.current = onNativeAssistantResponseDone;
  }, [onNativeAssistantResponseDone]);

  // Planned (post speech-planner) text per sentence index, for the current turn.
  const sentenceTextsRef = useRef(new Map<number, string>());
  // Audio-clock timing per sentence index, fed by useVoiceTtsQueue as chunks schedule.
  const sentenceTimingRef = useRef(new Map<number, SentenceTiming>());
  const sentenceIndexRef = useRef(0);
  const sentenceBufferRef = useRef("");
  const pendingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks only "has this sentence index been scheduled before" so
  // handleSentenceScheduled can detect the presence transition into
  // "speaking" exactly once per sentence. This is scheduling order, NOT
  // playback position — it must never be used to decide what text is
  // currently audible (that's findAudibleSentenceIndex, clock-derived).
  // -1 so the very first scheduled sentence (index 0) is detected as new.
  const currentSpeakingIndexRef = useRef(-1);
  const turnActiveRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  // True from the moment speech_started fires while Metrix is speaking,
  // until either a genuine barge-in commits or the utterance resolves as echo.
  const bargeInPendingRef = useRef(false);
  // True once interim evidence has confirmed this is real user speech, not echo.
  const bargeInCommittedRef = useRef(false);
  // True once this utterance has been recognized as a short stop command
  // ("dur" etc.) rather than genuine content — tells handleFinalTranscript
  // to discard the eventual final transcript instead of forwarding it as a
  // new question, even if it only resolves after the interim check already
  // interrupted playback.
  const bargeInIsCommandRef = useRef(false);
  // Incremented every time a turn is abandoned or restarted (resetTurnState
  // runs on beginTurn/interrupt/onStreamError/stop). The ack race captures
  // this before firing so a late-resolving ack from an already-abandoned
  // turn can't write into a new turn's sentence slot.
  const turnGenerationRef = useRef(0);
  // Faz 1A.1 — Native Voice Runtime. Accumulates
  // response.output_audio_transcript.delta chunks (via
  // handleNativeAssistantTranscriptDelta below) so revealedText shows the
  // native assistant's speech the same way it shows TTS-path sentences —
  // and so currentSpokenReference has something to compare a barge-in
  // candidate against (see that function's native-mode branch). Stays
  // empty, and is therefore never read, when the flag is off.
  const nativeAssistantTranscriptRef = useRef("");
  // Self-echo lifecycle fix — Native Voice Runtime. interrupt() snapshots
  // nativeAssistantTranscriptRef into this ref right before resetTurnState()
  // clears the live one, so the same interrupted utterance's own late final
  // transcript still has a real reference to compare against (see
  // resolveNativeSpokenReference/currentSpokenReference). Consumed exactly
  // once by handleFinalTranscript (never on a timer) and cleared whenever a
  // new native response actually starts (handleNativeResponseLifecycle) or
  // the session stops (stop()), so it can never leak into an unrelated
  // later utterance.
  const pendingInterruptedTranscriptRef = useRef("");
  // Final Fix — Native Voice Runtime transcript pacing. Drives
  // revealedText/revealedTextRef toward nativeAssistantTranscriptRef's
  // (full, already-known) content at a bounded rate instead of jumping
  // straight to it — see advanceNativeReveal above.
  const nativeRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeTranscriptDoneRef = useRef(false);
  const nativeResponseTerminalRef = useRef(false);
  const nativeResponseStatusRef = useRef<string | undefined>(undefined);
  const nativeResponseCommittedRef = useRef(false);

  // Content-free latency instrumentation (timestamps + stage names + numeric
  // identifiers only — never user text, prompts, tokens, or audio) for the
  // final-transcript → first-audio chain. Diagnostic only; does not affect
  // voice/ACK/TTS/Executive Brain behavior.
  const turnStartAtRef = useRef<number | null>(null);
  const latencyMarksRef = useRef({
    firstChunk: false,
    firstSentenceExtracted: false,
    firstSentence: false,
    firstAudio: false,
  });
  const logLatencyMark = useCallback(
    (label: string, extra?: Record<string, number | string | boolean | undefined>) => {
      if (turnStartAtRef.current === null) return;
      const now = performance.now();
      logVoiceLatency({
        label,
        turnId: turnGenerationRef.current,
        elapsedMs: Math.round(now - turnStartAtRef.current),
        at: now,
        ...extra,
      });
    },
    [],
  );

  const ttsQueueHandleRef = useRef<ReturnType<typeof useVoiceTtsQueue> | null>(null);
  const voiceConnectionHandleRef = useRef<ReturnType<typeof useVoiceChatConnection> | null>(null);

  const joinSentences = useCallback((uptoExclusive: number): string => {
    let out = "";
    for (let i = 0; i < uptoExclusive; i++) {
      const text = sentenceTextsRef.current.get(i);
      if (text) out += (out ? " " : "") + text;
    }
    return out;
  }, []);

  const stopRevealLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const stopNativeRevealTimer = useCallback(() => {
    nativeRevealTimerRef.current = clearNativeRevealTimer(nativeRevealTimerRef.current);
  }, []);

  const finalizeNativeResponseIfReady = useCallback(() => {
    const decision = decideNativeFinalization({
      targetText: nativeAssistantTranscriptRef.current,
      revealedText: revealedTextRef.current,
      transcriptDone: nativeTranscriptDoneRef.current,
      responseTerminal: nativeResponseTerminalRef.current,
      responseStatus: nativeResponseStatusRef.current,
      alreadyCommitted: nativeResponseCommittedRef.current,
    });
    if (!decision.shouldFinalize) return;

    nativeResponseCommittedRef.current = true;
    stopNativeRevealTimer();
    if (decision.commitText) {
      onNativeAssistantResponseDoneRef.current?.(decision.commitText);
    }
    turnActiveRef.current = false;
    setPresence({ kind: "listening" });
    voiceConnectionHandleRef.current?.unmuteInput();
  }, [setPresence, stopNativeRevealTimer]);

  // Idempotent — a delta arriving while the timer is already running is a
  // no-op call (guarded below), so every delta can safely call this without
  // spawning duplicate intervals.
  const startNativeRevealTimer = useCallback(() => {
    if (nativeRevealTimerRef.current !== null) return;
    nativeRevealTimerRef.current = setInterval(() => {
      const next = advanceNativeReveal(
        revealedTextRef.current,
        nativeAssistantTranscriptRef.current,
        NATIVE_REVEAL_CHARS_PER_TICK,
      );
      if (next !== revealedTextRef.current) {
        revealedTextRef.current = next;
        setRevealedText(next);
      }
      if (next === nativeAssistantTranscriptRef.current) {
        stopNativeRevealTimer();
        finalizeNativeResponseIfReady();
      }
    }, NATIVE_REVEAL_TICK_MS);
  }, [finalizeNativeResponseIfReady, stopNativeRevealTimer]);

  const startRevealLoop = useCallback(() => {
    stopRevealLoop();
    const tick = () => {
      const ctx = ttsQueueHandleRef.current?.getAudioContext() ?? null;
      if (ctx) {
        // Authoritative: which sentence is actually audible right now,
        // derived purely from the AudioContext clock — not "the last
        // sentence whose fetch happened to finish scheduling."
        const idx = findAudibleSentenceIndex(ctx.currentTime, sentenceTimingRef.current);
        const timing = idx >= 0 ? sentenceTimingRef.current.get(idx) : undefined;
        const fullText = idx >= 0 ? sentenceTextsRef.current.get(idx) ?? "" : "";

        if (timing) {
          const span = timing.endAt - timing.startAt;
          const rawFraction = span > 0 ? Math.min(1, Math.max(0, (ctx.currentTime - timing.startAt) / span)) : 1;
          const fraction = timing.isFinal ? rawFraction : Math.min(rawFraction, PENDING_SENTENCE_REVEAL_CAP);
          const revealedCount = Math.floor(fullText.length * fraction);
          const prior = joinSentences(idx);
          const revealed = `${prior}${prior ? " " : ""}${fullText.slice(0, revealedCount)}`;
          revealedTextRef.current = revealed;
          setRevealedText(revealed);
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [stopRevealLoop, joinSentences]);

  const resetTurnState = useCallback(() => {
    turnGenerationRef.current++;
    stopRevealLoop();
    stopNativeRevealTimer();
    sentenceTextsRef.current.clear();
    sentenceTimingRef.current.clear();
    sentenceIndexRef.current = 0;
    sentenceBufferRef.current = "";
    currentSpeakingIndexRef.current = -1;
    if (pendingFlushTimerRef.current !== null) {
      clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    bargeInPendingRef.current = false;
    bargeInCommittedRef.current = false;
    bargeInIsCommandRef.current = false;
    nativeAssistantTranscriptRef.current = "";
    nativeTranscriptDoneRef.current = false;
    nativeResponseTerminalRef.current = false;
    nativeResponseStatusRef.current = undefined;
    nativeResponseCommittedRef.current = false;
    revealedTextRef.current = "";
    setRevealedText("");
  }, [stopRevealLoop, stopNativeRevealTimer]);

  const enqueueSentence = useCallback((rawSentence: string) => {
    const index = sentenceIndexRef.current++;
    if (index === 0 && !latencyMarksRef.current.firstSentence) {
      latencyMarksRef.current.firstSentence = true;
      logLatencyMark("first_sentence_enqueued", { sentenceIndex: index });
    }
    const plan = planDelivery({ text: rawSentence });
    sentenceTextsRef.current.set(index, plan.text);
    ttsQueueHandleRef.current?.enqueue(plan.text, index, plan.styleHint);
  }, [logLatencyMark]);

  // What Metrix is actually audible saying right now (current + previous
  // sentence), used as the reference text for self-echo comparison. Must be
  // derived from the AudioContext clock (findAudibleSentenceIndex), not from
  // scheduling order — otherwise, for multi-sentence responses, this points
  // at a sentence that has merely been scheduled far ahead of what's
  // actually playing, so real self-echo of an earlier sentence fails to
  // match and gets misclassified as genuine user speech.
  const currentSpokenReference = useCallback((): string => {
    // Faz 1A.1 — Native Voice Runtime: no sentence queue/AudioContext clock
    // exists on this path (see onChunk/enqueueSentence, never invoked in
    // native mode), so fall back to the accumulated native transcript as
    // the self-echo reference instead of returning "" (which would make
    // isLikelySelfEcho always report "not an echo" and turn every sound
    // during native playback into an immediate genuine-barge-in decision).
    if (isVoiceNativeRealtimeEnabled()) {
      const reference = resolveNativeSpokenReference({
        nativeAssistantTranscript: nativeAssistantTranscriptRef.current,
        pendingInterruptedTranscript: pendingInterruptedTranscriptRef.current,
        revealedText: revealedTextRef.current,
      });
      if (reference) return reference;
    }
    const ctx = ttsQueueHandleRef.current?.getAudioContext() ?? null;
    if (!ctx) return "";
    const idx = findAudibleSentenceIndex(ctx.currentTime, sentenceTimingRef.current);
    if (idx < 0) return "";
    const current = sentenceTextsRef.current.get(idx) ?? "";
    const previous = idx > 0 ? sentenceTextsRef.current.get(idx - 1) ?? "" : "";
    return `${previous} ${current}`.trim();
  }, []);

  const handleQueueEmpty = useCallback(() => {
    logLatencyMark("queue_empty");
    stopRevealLoop();
    setRevealedText(joinSentences(sentenceIndexRef.current));
    turnActiveRef.current = false;
    setPresence({ kind: "listening" });
    voiceConnectionHandleRef.current?.unmuteInput();
  }, [stopRevealLoop, joinSentences, setPresence, logLatencyMark]);

  const handleSentenceScheduled = useCallback((index: number, timing: SentenceTiming) => {
    sentenceTimingRef.current.set(index, timing);
    const isNewSentence = currentSpeakingIndexRef.current !== index;
    currentSpeakingIndexRef.current = index;
    if (isNewSentence) {
      if (index === 0 && !latencyMarksRef.current.firstAudio) {
        latencyMarksRef.current.firstAudio = true;
        logLatencyMark("first_audio_scheduled", { sentenceIndex: index });
      }
      setPresence({ kind: "speaking", sentenceIndex: index });
      startRevealLoop();
    }
  }, [startRevealLoop, setPresence, logLatencyMark]);

  const ttsQueue = useVoiceTtsQueue(handleQueueEmpty, handleSentenceScheduled);
  ttsQueueHandleRef.current = ttsQueue;

  const beginTurn = useCallback(() => {
    resetTurnState();
    ttsQueueHandleRef.current?.reset();
    turnActiveRef.current = true;
    turnStartAtRef.current = performance.now();
    latencyMarksRef.current = {
      firstChunk: false,
      firstSentenceExtracted: false,
      firstSentence: false,
      firstAudio: false,
    };
    logLatencyMark("turn_start");
    setPresence({ kind: "thinking" });
  }, [resetTurnState, setPresence, logLatencyMark]);

  // Fires the quick-ack request in parallel with the real Executive Brain
  // request (already under way via onFinalTranscriptRef by the time this
  // runs). Races it against a hard timeout: if it wins, its text becomes
  // sentence 0 and the real response's first sentence shifts to index 1;
  // if it loses or fails, index 0 is left untouched and the real response's
  // first sentence takes it exactly as it does without an ack — no
  // degraded path, just no ack this turn.
  const beginAckRace = useCallback(
    (message: string) => {
      const raceGeneration = turnGenerationRef.current;
      const controller = new AbortController();
      const { ackTimeoutMs } = planTurnOpening();
      const timeoutId = setTimeout(() => controller.abort(), ackTimeoutMs);
      logLatencyMark("ack_request_started", { ackTimeoutMs });

      fetch(ACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId);
          if (raceGeneration !== turnGenerationRef.current || !res.ok) return;

          const json = (await res.json()) as { ok?: boolean; data?: { text?: string } };
          const text = json.ok ? json.data?.text?.trim() : undefined;
          if (!text) return;
          if (raceGeneration !== turnGenerationRef.current) return;
          // Real content already claimed index 0 (ack lost the race) —
          // never overwrite it.
          if (sentenceIndexRef.current !== 0) return;

          logLatencyMark("ack_ready", { sentenceIndex: 0 });
          const plan = planDelivery({ text });
          sentenceTextsRef.current.set(0, plan.text);
          ttsQueueHandleRef.current?.enqueue(plan.text, 0, plan.styleHint);
          sentenceIndexRef.current = 1;
        })
        .catch(() => undefined);
    },
    [logLatencyMark],
  );

  const interrupt = useCallback(() => {
    // Captured before resetTurnState() clears the sentence data backing it —
    // this is the only point where "what was actually audible so far" is
    // still available to hand back to the host component.
    const revealedAtInterrupt = revealedTextRef.current;
    // Self-echo lifecycle fix: snapshot what Metrix was actually saying
    // before resetTurnState() below clears nativeAssistantTranscriptRef —
    // this same utterance's own final transcript (STT) frequently arrives
    // after that clear, and without this snapshot it would be compared
    // against "" and could never be recognized as her own echo. See
    // pendingInterruptedTranscriptRef and handleFinalTranscript's
    // wasRecentlyInterrupted check, which consumes this exactly once.
    if (isVoiceNativeRealtimeEnabled()) {
      pendingInterruptedTranscriptRef.current = currentSpokenReference();
    }
    turnActiveRef.current = false;
    // Faz 1A.1 — Native Voice Runtime: no-op when there is no active native
    // response (see cancelActiveResponse's own guard), so this is safe to
    // call unconditionally on the existing (flag-off) barge-in path too.
    voiceConnectionHandleRef.current?.cancelActiveResponse();
    ttsQueueHandleRef.current?.reset();
    resetTurnState();
    setPresence({ kind: "userSpeaking" });
    onInterruptRef.current?.(revealedAtInterrupt);
  }, [resetTurnState, setPresence, currentSpokenReference]);

  // Reads presenceRef (not the `presence` closure variable) because this
  // callback is handed to useVoiceChatConnection, which binds it into
  // RTCDataChannel.onmessage exactly once when the connection opens and
  // never rebinds it (the connection persists across turns by design). A
  // direct read of `presence` here would freeze at whatever value existed
  // at connection-open time and never match "speaking"/"thinking" again —
  // which was the actual root cause of self-echo being treated as new user
  // speech (the barge-in evidence gate below was structurally unreachable).
  const handleSpeechStarted = useCallback(() => {
    if (deriveTurnOwner(presenceRef.current.kind) === "metrix") {
      if (presenceRef.current.kind === "speaking") {
        // Could be a genuine interruption or Metrix's own audio leaking into
        // the mic. Don't stop her yet — wait for interim transcript evidence
        // (handleInterimTranscript) to tell the two apart.
        bargeInPendingRef.current = true;
        bargeInCommittedRef.current = false;
        bargeInIsCommandRef.current = false;
        // speech_started is only VAD evidence. Keep playback alive until an
        // interim or final transcript passes the shared validation gate.
        return;
      }
      if (shouldInterruptOnSpeechStarted(presenceRef.current.kind)) {
        // thinking: no audio playing yet, so there is nothing to echo.
        interrupt();
      }
      return;
    }
    setPresence({ kind: "userSpeaking" });
  }, [interrupt, setPresence]);

  // Interim (pre-final) transcript deltas — only used to decide, as early as
  // possible, whether speech during playback is a real interruption or
  // self-echo. Real interruptions almost always diverge from Metrix's
  // current sentence within the first few words; echo does not.
  //
  // Short stop commands ("dur") are checked before the length gate, not
  // after: MIN_ECHO_CHECK_CHARS exists to give the divergence check enough
  // text to compare against, but a 3-character word can never reach that
  // threshold on its own, so without this check short commands could never
  // commit via the fast interim path at all — they'd always fall through to
  // the slow final-transcript path (bounded by speech_stopped + up to the
  // 1200ms fallback timer in useVoiceChatConnection), which is exactly the
  // 1-2s barge-in delay this fixes.
  const handleInterimTranscript = useCallback(
    (text: string) => {
      if (!bargeInPendingRef.current || bargeInCommittedRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const decision = classifyBargeInTranscript({
        candidate: trimmed,
        spokenReference: currentSpokenReference(),
        nativeAssistantActive: isVoiceNativeRealtimeEnabled(),
        isFinal: false,
      });

      if (decision === "interrupt_command") {
        bargeInCommittedRef.current = true;
        interrupt();
        // interrupt() resets turn refs; set this afterward so the matching
        // late final transcript is consumed instead of becoming a message.
        bargeInIsCommandRef.current = true;
        return;
      }

      if (decision === "user_speech") {
        bargeInCommittedRef.current = true;
        interrupt();
        return;
      }
    },
    [currentSpokenReference, interrupt],
  );

  const handleFinalTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const wasPending = bargeInPendingRef.current;
      const alreadyResolvedAsCommand = bargeInIsCommandRef.current;
      // Self-echo lifecycle fix: a response interrupted moments ago (see
      // interrupt()) can have this same utterance's final transcript arrive
      // after bargeInPendingRef was already reset by that interrupt —
      // pendingInterruptedTranscriptRef survives specifically so this one
      // evaluation can still tell real speech apart from her own echo.
      const wasRecentlyInterrupted = pendingInterruptedTranscriptRef.current.length > 0;
      const decision = classifyBargeInTranscript({
        candidate: trimmed,
        spokenReference: currentSpokenReference(),
        nativeAssistantActive: wasPending && isVoiceNativeRealtimeEnabled(),
        isFinal: true,
      });
      // One-shot: only the transcript evaluated right here may consult the
      // interrupted response's content — never on a timer, and never for
      // any later, unrelated utterance.
      pendingInterruptedTranscriptRef.current = "";

      // Every path below is terminal for this utterance.
      bargeInPendingRef.current = false;
      bargeInCommittedRef.current = false;
      bargeInIsCommandRef.current = false;

      if (alreadyResolvedAsCommand) {
        // handleInterimTranscript already stopped her for this utterance.
        // This is the same utterance's final transcript resolving late —
        // discard it instead of sending it to the brain as a new question.
        return;
      }

      if (wasPending && decision === "interrupt_command") {
        // Interim evidence never accumulated enough to catch it (e.g. the
        // conversation.item.created fallback path skips interim deltas
        // entirely) — still a stop command, not real content. Stop her now.
        interrupt();
        return;
      }

      // The whole utterance resolved without ever diverging from Metrix's
      // own speech (handleInterimTranscript never committed, or the
      // BARGE_IN_CONFIRMATION_TIMEOUT_MS fallback already interrupted her
      // before this evidence arrived — see wasRecentlyInterrupted) — almost
      // certainly mic pickup of her own audio, not a real message. Discard
      // rather than start a new turn from it.
      if (shouldDiscardFinalTranscript({ wasPending, wasRecentlyInterrupted, decision })) {
        return;
      }

      if (wasPending && decision === "user_speech") {
        // Server auto-interrupt is disabled in native mode. A validated final
        // therefore owns the one client-side cancel before becoming a user
        // message. cancelActiveResponse itself is idempotently active-gated.
        interrupt();
      }

      beginTurn();
      logLatencyMark("final_transcript_received");
      // Faz 1A.1 — Native Voice Runtime: the ack race is a Voice V4 HTTP
      // pipeline mechanism (fetches /voice/ack, a separate assistant voice
      // output) — running it alongside a native realtime response would be
      // exactly the "two assistant voices for one turn" risk this phase
      // must avoid. onFinalTranscriptRef itself stays unconditional below:
      // in native mode it still shows the user's own transcript bubble, but
      // is made a no-op for HTTP/TTS generation at the call site
      // (MetrixChatTab.tsx's send()), not here — see that file.
      if (!isVoiceNativeRealtimeEnabled()) {
        beginAckRace(text);
      }
      onFinalTranscriptRef.current(text);
    },
    [beginTurn, beginAckRace, currentSpokenReference, interrupt, logLatencyMark],
  );

  // Faz 1A.1 — Native Voice Runtime. Mirrors revealedText/presence updates
  // that the TTS-path equivalents (enqueueSentence/handleSentenceScheduled/
  // handleQueueEmpty) already do, but driven by realtime response events
  // instead of sentence scheduling — there is no sentence queue on this
  // path. See useVoiceChatConnection.ts's NativeRealtimeCallbacks for the
  // event source.
  //
  // Final Fix: nativeAssistantTranscriptRef (the full, already-known target
  // text) and revealedText (the paced, gradually-growing display) are now
  // deliberately decoupled — see advanceNativeReveal/startNativeRevealTimer
  // above. A delta only grows the TARGET; it does not jump revealedText to
  // it directly (that was the root cause of the whole response appearing
  // before the audio finished).
  const handleNativeAssistantTranscriptDelta = useCallback((delta: string) => {
    nativeAssistantTranscriptRef.current += delta;
    startNativeRevealTimer();
  }, [startNativeRevealTimer]);

  const handleNativeAssistantTranscriptDone = useCallback((finalText: string) => {
    // response.output_audio_transcript.done fires as soon as the transcript
    // stream ends — per the SDK's own doc comment, this can be well before
    // the audio actually finishes ("also emitted when a Response is
    // interrupted, incomplete, or cancelled"), i.e. often before the paced
    // reveal has caught up. Only the TARGET is updated here (a safety net —
    // in case this event's text is more complete than what deltas alone
    // accumulated); revealedText keeps advancing toward it at the normal
    // pace rather than snapping, so this must never itself jump revealedText
    // to finalText.
    nativeAssistantTranscriptRef.current = finalText;
    nativeTranscriptDoneRef.current = true;
    startNativeRevealTimer();
    finalizeNativeResponseIfReady();
  }, [finalizeNativeResponseIfReady, startNativeRevealTimer]);

  const handleNativeResponseLifecycle = useCallback(
    (phase: "started" | "audio_done" | "done", status?: string) => {
      if (phase === "started") {
        stopNativeRevealTimer();
        nativeAssistantTranscriptRef.current = "";
        nativeTranscriptDoneRef.current = false;
        nativeResponseTerminalRef.current = false;
        nativeResponseStatusRef.current = undefined;
        nativeResponseCommittedRef.current = false;
        // Self-echo lifecycle fix: a genuinely new response is starting —
        // any snapshot left over from a previous interrupt() no longer
        // describes what's being said now, so it must not leak into this
        // response's (or a later, unrelated utterance's) echo check.
        pendingInterruptedTranscriptRef.current = "";
        revealedTextRef.current = "";
        setRevealedText("");
        setPresence({ kind: "speaking", sentenceIndex: 0 });
        return;
      }
      if (phase === "audio_done") return;

      // response.done only marks terminal state. The live bubble remains and
      // the paced timer keeps catching up; the permanent message is committed
      // only when transcript.done has supplied the target and reveal reached
      // it. Cancelled/failed responses finalize only the already revealed
      // prefix, never the generated-but-unheard tail.
      nativeResponseTerminalRef.current = true;
      nativeResponseStatusRef.current = status;
      finalizeNativeResponseIfReady();
    },
    [finalizeNativeResponseIfReady, setPresence, stopNativeRevealTimer],
  );

  const voiceConnection = useVoiceChatConnection(
    handleFinalTranscript,
    handleSpeechStarted,
    handleInterimTranscript,
    {
      onAssistantTranscriptDelta: handleNativeAssistantTranscriptDelta,
      onAssistantTranscriptDone: handleNativeAssistantTranscriptDone,
      onRealtimeResponseLifecycle: handleNativeResponseLifecycle,
    },
  );
  voiceConnectionHandleRef.current = voiceConnection;

  const onChunk = useCallback((deltaText: string) => {
    if (!turnActiveRef.current) return;

    if (!latencyMarksRef.current.firstChunk) {
      latencyMarksRef.current.firstChunk = true;
      logLatencyMark("first_sse_chunk");
    }

    if (pendingFlushTimerRef.current !== null) {
      clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }

    sentenceBufferRef.current += deltaText;
    const { sentences, remainder } = extractSentences(sentenceBufferRef.current);
    sentenceBufferRef.current = remainder;
    if (sentences.length > 0 && !latencyMarksRef.current.firstSentenceExtracted) {
      latencyMarksRef.current.firstSentenceExtracted = true;
      logLatencyMark("first_sentence_extracted");
    }
    for (const sentence of sentences) {
      enqueueSentence(sentence);
    }

    // First-Sentence Early Flush: only while the turn's first sentence is
    // still streaming (index 0 not yet claimed by this loop or by the ack
    // race — see beginAckRace's matching guard) and no full sentence has
    // been found yet this chunk. Every later sentence is unaffected and
    // keeps the full-stop-only behavior above untouched.
    if (sentenceIndexRef.current === 0 && sentences.length === 0 && sentenceBufferRef.current) {
      const early = extractEarlyClauseSegment(sentenceBufferRef.current);
      if (early) {
        logLatencyMark("first_clause_early_flush", { length: early.segment.length });
        sentenceBufferRef.current = early.remainder;
        enqueueSentence(early.segment);
      }
    }

    if (sentenceBufferRef.current && endsWithTerminalPunctuation(sentenceBufferRef.current)) {
      pendingFlushTimerRef.current = setTimeout(() => {
        pendingFlushTimerRef.current = null;
        if (!turnActiveRef.current) return;
        const pending = sentenceBufferRef.current.trim();
        if (!pending) return;
        sentenceBufferRef.current = "";
        enqueueSentence(pending);
      }, 200);
    }
  }, [enqueueSentence, logLatencyMark]);

  const onStreamDone = useCallback(() => {
    if (!turnActiveRef.current) return;
    logLatencyMark("stream_done_received");
    if (pendingFlushTimerRef.current !== null) {
      clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    const remaining = sentenceBufferRef.current.trim();
    sentenceBufferRef.current = "";
    if (remaining) enqueueSentence(remaining);
    ttsQueueHandleRef.current?.markStreamDone();
    // presence stays thinking/speaking until the TTS queue actually drains (handleQueueEmpty)
  }, [enqueueSentence, logLatencyMark]);

  const onStreamError = useCallback(() => {
    if (!turnActiveRef.current) return;
    turnActiveRef.current = false;
    ttsQueueHandleRef.current?.reset();
    resetTurnState();
    setPresence({ kind: "listening" });
    voiceConnectionHandleRef.current?.unmuteInput();
  }, [resetTurnState, setPresence]);

  const start = useCallback(async () => {
    setPresence({ kind: "connecting" });
    try {
      await voiceConnectionHandleRef.current?.start();
      setPresence({ kind: "listening" });
    } catch (error) {
      setPresence({ kind: "idle" });
      throw error;
    }
  }, [setPresence]);

  const stop = useCallback(() => {
    turnActiveRef.current = false;
    ttsQueueHandleRef.current?.reset();
    resetTurnState();
    // Self-echo lifecycle fix: end the session-level lifecycle cleanly — a
    // snapshot left pending from an interrupt that never got its trailing
    // transcript must not survive into a later start()/session.
    pendingInterruptedTranscriptRef.current = "";
    voiceConnectionHandleRef.current?.stop();
    setPresence({ kind: "idle" });
  }, [resetTurnState, setPresence]);

  useEffect(() => stopRevealLoop, [stopRevealLoop]);
  useEffect(() => stopNativeRevealTimer, [stopNativeRevealTimer]);

  return {
    presence,
    turnOwner: deriveTurnOwner(presence.kind),
    revealedText,
    isConnected: voiceConnection.isConnected,
    connectionError: voiceConnection.connectionError,
    start,
    stop,
    beginTurn,
    onChunk,
    onStreamDone,
    onStreamError,
    logLatencyMark,
  };
}
