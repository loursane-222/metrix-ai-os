import type { SceneConfig } from "./types";

// Gerçek VO süreleri (ms) — gpt-4o-mini-tts / onyx / speed:1.00
// public/audio/reklam-v3-final/ klasöründen üretildi.
// duration = ceil(voiceDur) + 300ms geçiş tamponu
export const SCENE_CONFIGS: SceneConfig[] = [
  {
    id: "S01_Hook",
    label: "Hook",
    duration: 4500,       // voice: 4200ms
    enterDuration: 400,
    exitDuration: 300,
    transition: "SCALE_BLOOM",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-01.mp3",
    sfxEvents: [{ sfx: "bass_hit", at: 0 }],
  },
  {
    id: "S02_MetrixIntro",
    label: "Metrix Intro",
    duration: 4500,       // voice: 4200ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "SCALE_BLOOM",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-02.mp3",
    sfxEvents: [],
  },
  {
    id: "S03_Chaos",
    label: "Chaos",
    duration: 2900,       // voice: 2568ms
    enterDuration: 600,
    exitDuration: 300,
    transition: "BLUR_DISSOLVE",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-03.mp3",
    sfxEvents: [
      { sfx: "vibration",    at: 100 },
      { sfx: "notification", at: 600 },
      { sfx: "notification", at: 1400 },
    ],
  },
  {
    id: "S04_Breakthrough",
    label: "Breakthrough",
    duration: 5500,       // voice: 5112ms
    enterDuration: 200,
    exitDuration: 400,
    transition: "HARD_CUT",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-04.mp3",
    sfxEvents: [{ sfx: "bass_hit", at: 0 }],
  },
  {
    id: "S05_VoiceManagement",
    label: "Voice Management",
    duration: 4800,       // voice: 4464ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "RISE_UP",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-05.mp3",
    sfxEvents: [
      { sfx: "ui_click",     at: 800  },
      { sfx: "ui_click",     at: 2200 },
      { sfx: "notification", at: 3800 },
    ],
  },
  {
    id: "S06_NoMenus",
    label: "No Menus",
    duration: 4500,       // voice: 4152ms
    enterDuration: 400,
    exitDuration: 300,
    transition: "PUSH_LEFT",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-06.mp3",
    sfxEvents: [{ sfx: "whoosh", at: 200 }],
  },
  {
    id: "S07_ExecutiveTeam",
    label: "Executive Team",
    duration: 3100,       // voice: 2808ms
    enterDuration: 600,
    exitDuration: 400,
    transition: "SCALE_BLOOM",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-07-v2.mp3",
    sfxEvents: [
      { sfx: "ui_click", at: 400 },
      { sfx: "ui_click", at: 1200 },
    ],
  },
  {
    id: "S08_CalendarTasks",
    label: "Calendar & Tasks",
    duration: 4500,       // voice: 4152ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "PUSH_LEFT",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-08.mp3",
    sfxEvents: [
      { sfx: "ui_click",     at: 500  },
      { sfx: "notification", at: 2800 },
    ],
  },
  {
    id: "S09_Operations",
    label: "Operations",
    duration: 3900,       // voice: 3552ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "PUSH_LEFT",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-09.mp3",
    sfxEvents: [{ sfx: "ui_click", at: 400 }],
  },
  {
    id: "S10_Reports",
    label: "Reports",
    duration: 4100,       // voice: 3768ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "RISE_UP",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-10.mp3",
    sfxEvents: [{ sfx: "whoosh", at: 100 }],
  },
  {
    id: "S11_Import",
    label: "Import",
    duration: 3800,       // voice: 3504ms
    enterDuration: 400,
    exitDuration: 300,
    transition: "BLUR_DISSOLVE",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-11.mp3",
    sfxEvents: [{ sfx: "transition", at: 0 }],
  },
  {
    id: "S12_Research",
    label: "Research",
    duration: 3900,       // voice: 3552ms
    enterDuration: 500,
    exitDuration: 400,
    transition: "RISE_UP",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-12.mp3",
    sfxEvents: [{ sfx: "ui_click", at: 600 }],
  },
  {
    id: "S13_QuoteApproval",
    label: "Quote Approval",
    duration: 4500,       // voice: 4056ms
    enterDuration: 500,
    exitDuration: 500,
    transition: "CINEMATIC_FADE",
    animatePresenceMode: "sync",
    voiceSrc: "/audio/reklam-v3-final/scene-13.mp3",
    sfxEvents: [
      { sfx: "notification", at: 500  },
      { sfx: "ui_click",     at: 1800 },
      { sfx: "notification", at: 3500 },
    ],
  },
  {
    id: "S14_Finale",
    label: "Finale",
    // 14a: 4608ms + 550ms sessizlik + 14b: 2760ms = 7918ms + 500ms tampon = 8418 → 8500
    duration: 8500,
    enterDuration: 800,
    exitDuration: 0,
    transition: "CINEMATIC_FADE",
    animatePresenceMode: "wait",
    voiceSrc: "/audio/reklam-v3-final/scene-14a.mp3",
    secondaryVoiceSrc: "/audio/reklam-v3-final/scene-14b.mp3",
    secondaryVoiceAt: 5200, // 4608ms (14a) + 550ms sessizlik ≈ 5200ms
    sfxEvents: [{ sfx: "bass_hit", at: 1200 }],
  },
];

export const TOTAL_DURATION_MS = SCENE_CONFIGS.reduce(
  (acc, s) => acc + s.duration,
  0
);
