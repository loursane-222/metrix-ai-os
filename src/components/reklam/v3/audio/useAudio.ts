"use client";

import { useCallback, useRef, useState } from "react";
import type { AudioEngineHandle, SFXType } from "../types";

// VO önde, müzik arka plan, SFX üçüncü planda
const SFX_VOLUME   = 0.32;
const MUSIC_VOLUME = 0.10;

const SFX_SRCS: Record<SFXType, string> = {
  bass_hit:     "/audio/sfx/bass-hit.wav",
  whoosh:       "/audio/sfx/whoosh.wav",
  notification: "/audio/sfx/notification.wav",
  vibration:    "/audio/sfx/vibration.wav",
  ui_click:     "/audio/sfx/ui-click.wav",
  transition:   "/audio/sfx/transition.wav",
};

export function useAudio(): AudioEngineHandle {
  const [isReady, setIsReady] = useState(false);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef   = useRef<Map<SFXType, HTMLAudioElement>>(new Map());

  // Kullanıcı gesture'ı içinde çağrılmalı (autoplay unlock).
  const init = useCallback(() => {
    if (isReady) return;

    (Object.entries(SFX_SRCS) as [SFXType, string][]).forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.volume = 0;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = SFX_VOLUME;
        })
        .catch(() => { audio.volume = SFX_VOLUME; });
      sfxRef.current.set(key, audio);
    });

    setIsReady(true);
  }, [isReady]);

  const playVoice = useCallback((src: string) => {
    voiceRef.current?.pause();
    voiceRef.current = new Audio(src);
    voiceRef.current.play().catch(() => {});
  }, []);

  const stopVoice = useCallback(() => {
    voiceRef.current?.pause();
    voiceRef.current = null;
  }, []);

  const playMusic = useCallback((src: string, loop = true) => {
    musicRef.current?.pause();
    musicRef.current = new Audio(src);
    musicRef.current.loop = loop;
    musicRef.current.volume = MUSIC_VOLUME;
    musicRef.current.play().catch(() => {});
  }, []);

  const stopMusic = useCallback(() => {
    musicRef.current?.pause();
    musicRef.current = null;
  }, []);

  const setMusicVolume = useCallback((v: number) => {
    if (musicRef.current) musicRef.current.volume = Math.max(0, Math.min(1, v));
  }, []);

  // Her SFX çağrısında clone — hızlı ardışık tetiklemelerde overlap yapar.
  const playSFX = useCallback((sfx: SFXType) => {
    const audio = sfxRef.current.get(sfx);
    if (!audio) return;
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = audio.volume;
    clone.play().catch(() => {});
  }, []);

  return {
    init,
    playVoice,
    stopVoice,
    playMusic,
    stopMusic,
    setMusicVolume,
    playSFX,
    isReady,
  };
}
