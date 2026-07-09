"use client";

import { useCallback, useEffect, useRef } from "react";

import type { TtsStyleHint } from "./voice/rhythmEngine";

const TTS_ENDPOINT = "/api/ai/chat/voice/tts";
const PCM_SAMPLE_RATE = 24000;

// isFinal is false while more chunks for this sentence may still arrive —
// endAt only reflects audio scheduled so far, not the sentence's true total
// duration, so callers must not treat the sentence as "fully revealable"
// until isFinal is true (set once the sentence's stream has fully drained).
export type SentenceTiming = { startAt: number; endAt: number; isFinal: boolean };

type UseVoiceTtsQueueResult = {
  enqueue: (text: string, index: number, styleHint?: TtsStyleHint) => void;
  reset: () => void;
  getAudioContext: () => AudioContext | null;
};

export function useVoiceTtsQueue(
  onQueueEmpty?: () => void,
  onSentenceScheduled?: (index: number, timing: SentenceTiming) => void,
): UseVoiceTtsQueueResult {
  // Map of sentence index → completion promise (resolves when all chunks scheduled)
  const fetchMapRef = useRef(new Map<number, Promise<void>>());
  // PCM chunks read from a sentence's stream before its turn to schedule
  // arrived. Reading is never gated on turn order — network transfer and
  // synthesis for a not-yet-current sentence proceed during the current
  // sentence's playback, so its audio is already available the instant its
  // turn comes instead of only starting to arrive after the handoff. Only
  // scheduleChunk() (and therefore the shared AudioContext timeline) stays
  // strictly ordered by nextPlayRef.
  const pendingChunksRef = useRef(new Map<number, Uint8Array[]>());
  // Indices whose turn has come: their buffered chunks have been flushed and
  // any further chunks still arriving from their (still in-flight) read loop
  // are scheduled directly instead of buffered.
  const liveSchedulingRef = useRef(new Set<number>());
  // Index of the next sentence to process
  const nextPlayRef = useRef(0);
  // True while waiting for the current sentence's streaming to complete
  const isActiveRef = useRef(false);
  // All currently live AudioBufferSourceNodes (stopped on reset)
  const activeSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  // The last scheduled source — its onended fires onQueueEmpty
  const lastSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Next available start time in the AudioContext clock (gapless scheduling)
  const scheduledEndTimeRef = useRef(0);
  // AudioContext — lazy, created on first enqueue()
  const audioContextRef = useRef<AudioContext | null>(null);
  // All in-flight fetch AbortControllers — aborted on reset()
  const abortControllersRef = useRef<AbortController[]>([]);
  // Incremented on reset() so stale callbacks know to bail
  const generationRef = useRef(0);
  // Per-sentence audio-clock timing, so callers (the voice orchestrator) can
  // sync text reveal to actual playback instead of a fixed-rate timer.
  const sentenceTimingRef = useRef(new Map<number, SentenceTiming>());
  // Stable ref so scheduleChunk always sees the latest onQueueEmpty
  const onQueueEmptyRef = useRef(onQueueEmpty);
  useEffect(() => {
    onQueueEmptyRef.current = onQueueEmpty;
  }, [onQueueEmpty]);
  const onSentenceScheduledRef = useRef(onSentenceScheduled);
  useEffect(() => {
    onSentenceScheduledRef.current = onSentenceScheduled;
  }, [onSentenceScheduled]);

  function getOrCreateAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }

  function scheduleChunk(pcmBytes: Uint8Array, gen: number, index: number): void {
    const ctx = audioContextRef.current;
    if (!ctx || generationRef.current !== gen) return;

    const samples = pcmBytes.length / 2;
    if (samples === 0) return;

    const audioBuffer = ctx.createBuffer(1, samples, PCM_SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);

    for (let i = 0; i < samples; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, scheduledEndTimeRef.current);
    const endAt = startAt + audioBuffer.duration;
    scheduledEndTimeRef.current = endAt;

    const existingTiming = sentenceTimingRef.current.get(index);
    // Never final here — this call only proves one more chunk was scheduled,
    // not that the sentence's stream has finished (see finalizeSentenceTiming).
    const timing: SentenceTiming = { startAt: existingTiming?.startAt ?? startAt, endAt, isFinal: false };
    sentenceTimingRef.current.set(index, timing);
    onSentenceScheduledRef.current?.(index, timing);

    activeSourcesRef.current.add(source);
    lastSourceRef.current = source;

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (generationRef.current !== gen) return;
      if (source === lastSourceRef.current && fetchMapRef.current.size === 0) {
        onQueueEmptyRef.current?.();
      }
    };

    try {
      source.start(startAt);
    } catch {
      source.onended = null;
      activeSourcesRef.current.delete(source);
      if (lastSourceRef.current === source) {
        lastSourceRef.current = null;
      }
    }
  }

  // Called once a sentence's TTS stream has fully drained — only at this
  // point is its true total duration known, so the reveal loop can safely
  // stop capping how much of the sentence it reveals.
  function finalizeSentenceTiming(index: number, gen: number): void {
    if (generationRef.current !== gen) return;
    const timing = sentenceTimingRef.current.get(index);
    if (!timing) return;
    const finalized: SentenceTiming = { ...timing, isFinal: true };
    sentenceTimingRef.current.set(index, finalized);
    onSentenceScheduledRef.current?.(index, finalized);
  }

  const advance = useCallback(() => {
    if (isActiveRef.current) return;

    const idx = nextPlayRef.current;
    const promise = fetchMapRef.current.get(idx);
    if (!promise) return;

    isActiveRef.current = true;
    const gen = generationRef.current;

    // This index's turn has come: flush whatever its read loop already
    // buffered while it was waiting, in arrival order, then switch it to
    // live scheduling for any chunks still streaming in.
    const buffered = pendingChunksRef.current.get(idx);
    pendingChunksRef.current.delete(idx);
    buffered?.forEach((chunk) => scheduleChunk(chunk, gen, idx));
    liveSchedulingRef.current.add(idx);

    void promise.then(() => {
      if (generationRef.current !== gen) return;
      fetchMapRef.current.delete(idx);
      liveSchedulingRef.current.delete(idx);
      nextPlayRef.current++;
      isActiveRef.current = false;
      advance();
    });
  }, []);

  const enqueue = useCallback(
    (text: string, index: number, styleHint?: TtsStyleHint) => {
      // Create AudioContext eagerly — satisfies iOS Safari's gesture requirement.
      getOrCreateAudioContext();

      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      const gen = generationRef.current;

      const promise: Promise<void> = fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, styleHint: styleHint ?? "neutral" }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) return;
          if (generationRef.current !== gen) return;

          const reader = res.body.getReader();
          let leftover = new Uint8Array(0);

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done || generationRef.current !== gen) break;

              let combined: Uint8Array;
              if (leftover.length > 0) {
                combined = new Uint8Array(leftover.length + value.length);
                combined.set(leftover);
                combined.set(value, leftover.length);
                leftover = new Uint8Array(0);
              } else {
                combined = value;
              }

              const usableLength = combined.length - (combined.length % 2);
              if (usableLength > 0) {
                const chunk = combined.subarray(0, usableLength);
                if (liveSchedulingRef.current.has(index)) {
                  scheduleChunk(chunk, gen, index);
                } else {
                  const bucket = pendingChunksRef.current.get(index);
                  if (bucket) {
                    bucket.push(chunk);
                  } else {
                    pendingChunksRef.current.set(index, [chunk]);
                  }
                }
              }
              if (combined.length % 2 === 1) {
                leftover = combined.slice(usableLength);
              }
            }
          } finally {
            reader.releaseLock();
          }
          // trailing leftover byte (incomplete PCM sample) is discarded
          finalizeSentenceTiming(index, gen);
        })
        .catch(() => undefined);

      fetchMapRef.current.set(index, promise);
      advance();
    },
    [advance],
  );

  const reset = useCallback(() => {
    generationRef.current++;

    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current = [];

    pendingChunksRef.current.clear();
    liveSchedulingRef.current.clear();

    // Stop all live scheduled sources
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped or never started.
      }
    });
    activeSourcesRef.current.clear();

    lastSourceRef.current = null;
    scheduledEndTimeRef.current = 0;
    isActiveRef.current = false;
    nextPlayRef.current = 0;
    fetchMapRef.current.clear();
    sentenceTimingRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      reset();
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, [reset]);

  const getAudioContext = useCallback(() => audioContextRef.current, []);

  return { enqueue, reset, getAudioContext };
}
