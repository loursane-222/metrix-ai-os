"use client";

import { useCallback, useRef, useState } from "react";
import { SCENE_CONFIGS } from "../constants";
import type { AudioEngineHandle } from "../types";

interface TimelineState {
  sceneIndex: number; // -1 = henüz başlamadı
  isPlaying: boolean;
  isPaused: boolean;
}

export interface TimelineHandle extends TimelineState {
  start(): void;
  pause(): void;
  resume(): void;
  goToScene(index: number): void;
}

export function useTimeline(audio: AudioEngineHandle): TimelineHandle {
  const [state, setState] = useState<TimelineState>({
    sceneIndex: -1,
    isPlaying: false,
    isPaused: false,
  });

  const advanceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sfxTimersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pausedElapsedRef  = useRef<number>(0);
  const sceneStartWallRef = useRef<number>(0);

  // Ref ile tut — kendi kendini çağıran fonksiyonlarda useCallback döngüsünü kırar.
  const activateRef = useRef<(index: number, elapsedOffset?: number) => void>(null!);

  const clearAllTimers = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    sfxTimersRef.current.forEach(clearTimeout);
    sfxTimersRef.current = [];
  }, []);

  activateRef.current = (index: number, elapsedOffset = 0) => {
    clearAllTimers();

    const config = SCENE_CONFIGS[index];
    if (!config) return;

    sceneStartWallRef.current = Date.now() - elapsedOffset;
    setState({ sceneIndex: index, isPlaying: true, isPaused: false });

    // Ana ses — sadece sahnenin başından oynatılıyorsa tetikle
    if (config.voiceSrc && elapsedOffset === 0) {
      audio.playVoice(config.voiceSrc);
    }

    // S14 gibi iki parçalı sesler için ikincil ses
    if (config.secondaryVoiceSrc && config.secondaryVoiceAt !== undefined) {
      const delay = config.secondaryVoiceAt - elapsedOffset;
      if (delay >= 0) {
        const t = setTimeout(() => audio.playVoice(config.secondaryVoiceSrc!), delay);
        sfxTimersRef.current.push(t);
      }
    }

    config.sfxEvents.forEach(({ sfx, at }) => {
      const delay = at - elapsedOffset;
      if (delay >= 0) {
        const t = setTimeout(() => audio.playSFX(sfx), delay);
        sfxTimersRef.current.push(t);
      }
    });

    const remaining = config.duration - elapsedOffset;
    advanceTimerRef.current = setTimeout(() => {
      const next = index + 1;
      if (next < SCENE_CONFIGS.length) {
        activateRef.current(next);
      } else {
        setState({ sceneIndex: index, isPlaying: false, isPaused: false });
      }
    }, remaining);
  };

  const start = useCallback(() => {
    activateRef.current(0);
  }, []);

  const pause = useCallback(() => {
    clearAllTimers();
    audio.stopVoice();
    pausedElapsedRef.current = Date.now() - sceneStartWallRef.current;
    setState((s) => ({ ...s, isPlaying: false, isPaused: true }));
  }, [audio.stopVoice, clearAllTimers]);

  const resume = useCallback(() => {
    setState((s) => {
      if (s.sceneIndex >= 0) activateRef.current(s.sceneIndex, pausedElapsedRef.current);
      return s;
    });
  }, []);

  const goToScene = useCallback((index: number) => {
    activateRef.current(index);
  }, []);

  return { ...state, start, pause, resume, goToScene };
}
