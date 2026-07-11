"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useVoiceChatConnection } from "../useVoiceChatConnection";
import { useVoiceTtsQueue, type SentenceTiming } from "../useVoiceTtsQueue";
import { extractSentences, endsWithTerminalPunctuation } from "./speechPlanner";
import { planDelivery, planTurnOpening } from "./rhythmEngine";
import { deriveTurnOwner, type TurnOwner } from "./turnOwnership";

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

// Self-echo guard: while Metrix's own TTS audio plays, the mic can pick up
// enough of it (imperfect echo cancellation, especially over speakers) for
// the realtime API to report it as user speech. Rather than trust VAD alone,
// any candidate transcript arriving while Metrix speaks is compared against
// what she is actually saying — a signal we already know exactly, since we
// generated it. Only genuinely divergent speech is treated as a real
// interruption.
const MIN_ECHO_CHECK_CHARS = 6;
const ECHO_WORD_OVERLAP_THRESHOLD = 0.6;

// Absolute upper bound on how long Metrix may keep speaking after
// speech_started while a barge-in is only "pending" (echo vs genuine
// interruption still undecided). Echo suspicion must never block a real
// interruption forever — if no interim evidence resolves the ambiguity
// within this window, it is treated as a genuine interruption regardless.
const BARGE_IN_CONFIRMATION_TIMEOUT_MS = 200;

function normalizeForEchoCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:…"'()]/g, "")
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

function isLikelySelfEcho(candidate: string, reference: string): boolean {
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
const INTERRUPT_COMMAND_PHRASES = new Set(["dur", "kes", "bekle", "bir saniye"]);

function isInterruptCommand(text: string): boolean {
  return INTERRUPT_COMMAND_PHRASES.has(normalizeForEchoCompare(text));
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
  onInterrupt?: () => void,
): UseVoiceExperienceOrchestratorResult {
  const [presence, setPresenceState] = useState<VoicePresence>({ kind: "idle" });
  const [revealedText, setRevealedText] = useState("");

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

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Lets the host component abort its in-flight /api/ai/chat request the
  // instant a genuine barge-in is decided (see interrupt() below) — the
  // orchestrator has no reference to that fetch itself, only the host does.
  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => {
    onInterruptRef.current = onInterrupt;
  }, [onInterrupt]);

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
  // Fires interrupt() unconditionally BARGE_IN_CONFIRMATION_TIMEOUT_MS after
  // speech_started if the pending barge-in is still undecided at that point
  // (no interim evidence arrived, or none of it resolved the ambiguity).
  // Cleared the instant the ambiguity resolves one way or the other (interim
  // evidence, final transcript, a newer speech_started, or unmount) so it
  // never fires once the decision is already made.
  const bargeInConfirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented every time a turn is abandoned or restarted (resetTurnState
  // runs on beginTurn/interrupt/onStreamError/stop). The ack race captures
  // this before firing so a late-resolving ack from an already-abandoned
  // turn can't write into a new turn's sentence slot.
  const turnGenerationRef = useRef(0);

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

  const clearBargeInConfirmationTimer = useCallback(() => {
    if (bargeInConfirmationTimerRef.current !== null) {
      clearTimeout(bargeInConfirmationTimerRef.current);
      bargeInConfirmationTimerRef.current = null;
    }
  }, []);

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
          setRevealedText(`${prior}${prior ? " " : ""}${fullText.slice(0, revealedCount)}`);
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [stopRevealLoop, joinSentences]);

  const resetTurnState = useCallback(() => {
    turnGenerationRef.current++;
    stopRevealLoop();
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
    setRevealedText("");
  }, [stopRevealLoop]);

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
    turnActiveRef.current = false;
    ttsQueueHandleRef.current?.reset();
    resetTurnState();
    setPresence({ kind: "userSpeaking" });
    onInterruptRef.current?.();
  }, [resetTurnState, setPresence]);

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
        // (handleInterimTranscript) to tell the two apart. But never wait
        // indefinitely: if the ambiguity is still unresolved after
        // BARGE_IN_CONFIRMATION_TIMEOUT_MS, interrupt unconditionally.
        bargeInPendingRef.current = true;
        bargeInCommittedRef.current = false;
        clearBargeInConfirmationTimer();
        bargeInConfirmationTimerRef.current = setTimeout(() => {
          bargeInConfirmationTimerRef.current = null;
          if (bargeInPendingRef.current) {
            interrupt();
          }
        }, BARGE_IN_CONFIRMATION_TIMEOUT_MS);
        return;
      }
      // thinking: no audio playing yet, so there is nothing to echo —
      // always a genuine interruption. Cancel the in-flight turn cleanly.
      interrupt();
      return;
    }
    setPresence({ kind: "userSpeaking" });
  }, [interrupt, setPresence, clearBargeInConfirmationTimer]);

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

      if (isInterruptCommand(trimmed)) {
        bargeInCommittedRef.current = true;
        bargeInIsCommandRef.current = true;
        clearBargeInConfirmationTimer();
        interrupt();
        return;
      }

      if (trimmed.length < MIN_ECHO_CHECK_CHARS) return;

      if (!isLikelySelfEcho(trimmed, currentSpokenReference())) {
        bargeInCommittedRef.current = true;
        clearBargeInConfirmationTimer();
        interrupt();
        return;
      }

      // Interim evidence clearly matches Metrix's own speech — cancel the
      // upper-bound timer (it must not cut her off at
      // BARGE_IN_CONFIRMATION_TIMEOUT_MS for her own audio) but leave
      // bargeInPendingRef set. handleFinalTranscript's wasPending +
      // isLikelySelfEcho guard depends on it still being true when this
      // utterance's final transcript arrives; clearing it here would make
      // that guard unreachable and let the echoed final transcript through
      // to the brain as a new user message.
      clearBargeInConfirmationTimer();
    },
    [currentSpokenReference, interrupt, clearBargeInConfirmationTimer],
  );

  const handleFinalTranscript = useCallback(
    (text: string) => {
      clearBargeInConfirmationTimer();
      const trimmed = text.trim();
      const wasPending = bargeInPendingRef.current;
      const alreadyResolvedAsCommand = bargeInIsCommandRef.current;

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

      if (wasPending && isInterruptCommand(trimmed)) {
        // Interim evidence never accumulated enough to catch it (e.g. the
        // conversation.item.created fallback path skips interim deltas
        // entirely) — still a stop command, not real content. Stop her now.
        interrupt();
        return;
      }

      // The whole utterance resolved without ever diverging from Metrix's
      // own speech (handleInterimTranscript never committed) — almost
      // certainly mic pickup of her own audio, not a real message. Discard
      // rather than start a new turn from it.
      if (wasPending && isLikelySelfEcho(trimmed, currentSpokenReference())) {
        return;
      }

      beginTurn();
      logLatencyMark("final_transcript_received");
      beginAckRace(text);
      onFinalTranscriptRef.current(text);
    },
    [beginTurn, beginAckRace, currentSpokenReference, interrupt, logLatencyMark, clearBargeInConfirmationTimer],
  );

  const voiceConnection = useVoiceChatConnection(
    handleFinalTranscript,
    handleSpeechStarted,
    handleInterimTranscript,
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
    voiceConnectionHandleRef.current?.stop();
    setPresence({ kind: "idle" });
  }, [resetTurnState, setPresence]);

  useEffect(() => stopRevealLoop, [stopRevealLoop]);
  useEffect(() => clearBargeInConfirmationTimer, [clearBargeInConfirmationTimer]);

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
