"use client";

export type SFXType =
  | "bass_hit"
  | "whoosh"
  | "notification"
  | "vibration"
  | "ui_click"
  | "transition";

export type TransitionType =
  | "HARD_CUT"
  | "CINEMATIC_FADE"
  | "SCALE_BLOOM"
  | "PUSH_LEFT"
  | "BLUR_DISSOLVE"
  | "RISE_UP";

export interface SFXEvent {
  sfx: SFXType;
  at: number; // ms from scene start
}

export interface SceneConfig {
  id: string;
  label: string;
  duration: number;           // total ms (includes enter + exit)
  enterDuration: number;      // ms
  exitDuration: number;       // ms
  transition: TransitionType;
  animatePresenceMode: "sync" | "wait";
  sfxEvents: SFXEvent[];
  voiceSrc?: string;
  secondaryVoiceSrc?: string; // S14 split: ikinci ses dosyası
  secondaryVoiceAt?: number;  // ms from scene start
}

export interface AudioEngineHandle {
  init(): void;
  playVoice(src: string): void;
  stopVoice(): void;
  playMusic(src: string, loop?: boolean): void;
  stopMusic(): void;
  setMusicVolume(v: number): void;
  playSFX(sfx: SFXType): void;
  isReady: boolean;
}

export interface SceneProps {
  audioEngine: AudioEngineHandle;
  onComplete?: () => void;
}
