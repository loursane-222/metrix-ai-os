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
  // Resolve functions to open per-sentence scheduling gates
  const schedulingGatesRef = useRef(new Map<number, () => void>());
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

    // Open the scheduling gate so this sentence's stream can start
    schedulingGatesRef.current.get(idx)?.();
    schedulingGatesRef.current.delete(idx);

    void promise.then(() => {
      if (generationRef.current !== gen) return;
      fetchMapRef.current.delete(idx);
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

      // Gate opened by advance() when it's this sentence's turn to stream
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });

      const promise: Promise<void> = fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, styleHint: styleHint ?? "neutral" }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) return;

          // Wait until advance() signals it's this sentence's turn
          await gate;
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
                scheduleChunk(combined.subarray(0, usableLength), gen, index);
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
      schedulingGatesRef.current.set(index, openGate);
      advance();
    },
    [advance],
  );

  const reset = useCallback(() => {
    generationRef.current++;

    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current = [];

    // Unblock pending gates so their async functions can exit cleanly
    schedulingGatesRef.current.forEach((resolve) => resolve());
    schedulingGatesRef.current.clear();

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
