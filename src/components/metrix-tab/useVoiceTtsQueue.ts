"use client";

import { useCallback, useEffect, useRef } from "react";

const TTS_ENDPOINT = "/api/ai/chat/voice/tts";

type UseVoiceTtsQueueResult = {
  enqueue: (text: string, index: number) => void;
  reset: () => void;
};

export function useVoiceTtsQueue(): UseVoiceTtsQueueResult {
  // Map of sentence index → TTS fetch promise (Blob or null on failure)
  const fetchMapRef = useRef(new Map<number, Promise<Blob | null>>());
  // Index of next sentence to play
  const nextPlayRef = useRef(0);
  // True while waiting for a TTS promise OR while audio is playing
  const isActiveRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Incremented on reset() so stale promise callbacks know to bail
  const generationRef = useRef(0);

  const advance = useCallback(() => {
    if (isActiveRef.current) return;

    const idx = nextPlayRef.current;
    const promise = fetchMapRef.current.get(idx);
    if (!promise) return;

    isActiveRef.current = true;
    const gen = generationRef.current;

    void promise.then((blob) => {
      if (generationRef.current !== gen) return;

      fetchMapRef.current.delete(idx);

      if (!blob) {
        // TTS failed for this sentence — skip and try next
        nextPlayRef.current++;
        isActiveRef.current = false;
        advance();
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const onDone = () => {
        URL.revokeObjectURL(url);
        if (generationRef.current !== gen) return;
        currentAudioRef.current = null;
        nextPlayRef.current++;
        isActiveRef.current = false;
        advance();
      };

      audio.onended = onDone;
      audio.play().catch(onDone);
    });
  }, []);

  const enqueue = useCallback(
    (text: string, index: number) => {
      const promise = fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => (res.ok ? res.blob() : null))
        .catch(() => null);

      fetchMapRef.current.set(index, promise);

      // When this fetch resolves, attempt to advance (handles out-of-order arrival)
      void promise.then(() => advance());

      // Also attempt immediately in case this is the next expected index
      advance();
    },
    [advance],
  );

  const reset = useCallback(() => {
    // Invalidate all in-flight promise callbacks
    generationRef.current++;

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }

    isActiveRef.current = false;
    nextPlayRef.current = 0;
    fetchMapRef.current.clear();
  }, []);

  // Stop audio and clear state on unmount
  useEffect(() => {
    return reset;
  }, [reset]);

  return { enqueue, reset };
}
