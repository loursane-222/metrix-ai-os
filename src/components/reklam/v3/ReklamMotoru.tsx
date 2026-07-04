"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType } from "react";
import { useAudio } from "./audio/useAudio";
import { SCENE_CONFIGS } from "./constants";
import { Scene01_Hook } from "./scenes/Scene01_Hook";
import { Scene02_MetrixIntro } from "./scenes/Scene02_MetrixIntro";
import { Scene03_Chaos } from "./scenes/Scene03_Chaos";
import { Scene04_Breakthrough } from "./scenes/Scene04_Breakthrough";
import { Scene05_VoiceManagement } from "./scenes/Scene05_VoiceManagement";
import { Scene06_NoMenus } from "./scenes/Scene06_NoMenus";
import { Scene07_ExecutiveTeam } from "./scenes/Scene07_ExecutiveTeam";
import { Scene08_CalendarTasks } from "./scenes/Scene08_CalendarTasks";
import { Scene09_Operations } from "./scenes/Scene09_Operations";
import { Scene10_Reports } from "./scenes/Scene10_Reports";
import { Scene11_Import } from "./scenes/Scene11_Import";
import { Scene12_Research } from "./scenes/Scene12_Research";
import { Scene13_QuoteApproval } from "./scenes/Scene13_QuoteApproval";
import { Scene14_Finale } from "./scenes/Scene14_Finale";
import { useTimeline } from "./timeline/useTimeline";
import { TRANSITION_VARIANTS } from "./transitions/variants";
import type { SceneProps } from "./types";

const SCENES: ComponentType<SceneProps>[] = [
  Scene01_Hook, Scene02_MetrixIntro, Scene03_Chaos, Scene04_Breakthrough,
  Scene05_VoiceManagement, Scene06_NoMenus, Scene07_ExecutiveTeam,
  Scene08_CalendarTasks, Scene09_Operations, Scene10_Reports,
  Scene11_Import, Scene12_Research, Scene13_QuoteApproval, Scene14_Finale,
];

const DEV_BTN = {
  className: "px-3 py-1 rounded-lg text-[11px]",
  style: { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" },
};

interface Props {
  showDevControls?: boolean;
}

export function ReklamMotoru({ showDevControls = false }: Props) {
  const audioEngine = useAudio();
  const timeline    = useTimeline(audioEngine);

  const handleBaslat = () => {
    audioEngine.init();
    audioEngine.playMusic("/audio/music/ambient.wav");
    timeline.start();
  };

  const CurrentScene  = timeline.sceneIndex >= 0 ? SCENES[timeline.sceneIndex]        : null;
  const currentConfig = timeline.sceneIndex >= 0 ? SCENE_CONFIGS[timeline.sceneIndex] : null;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div
        className="relative overflow-hidden"
        style={{
          height: "min(100dvh, calc(100dvw * 16 / 9))",
          width:  "min(100dvw, calc(100dvh * 9 / 16))",
          background: "#080808",
        }}
      >
        {/* Başlangıç ekranı */}
        <AnimatePresence>
          {timeline.sceneIndex === -1 && (
            <motion.div
              key="start"
              className="absolute inset-0 flex flex-col items-center justify-center gap-8 select-none"
              style={{ background: "linear-gradient(160deg, #080808 0%, #0f0a1e 100%)" }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35 }}
            >
              <MetrixLogo />
              <button
                onClick={handleBaslat}
                className="px-10 py-4 rounded-2xl font-semibold text-[15px] tracking-wide"
                style={{
                  color: "#5236F5",
                  background: "rgba(82,54,245,0.1)",
                  border: "1px solid rgba(82,54,245,0.3)",
                }}
              >
                Başlat
              </button>
              <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>
                🔊 En iyi deneyim için sesi açın
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sahne oynatıcı */}
        <AnimatePresence mode="sync">
          {CurrentScene && currentConfig && (
            <motion.div
              key={timeline.sceneIndex}
              className="absolute inset-0"
              variants={TRANSITION_VARIANTS[currentConfig.transition]}
              initial="enter"
              animate="active"
              exit="exit"
            >
              <CurrentScene audioEngine={audioEngine} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Geliştirici kontrolleri */}
        {showDevControls && timeline.sceneIndex >= 0 && (
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3 z-50">
            <button
              {...DEV_BTN}
              onClick={() => timeline.goToScene(Math.max(0, timeline.sceneIndex - 1))}
            >
              ←
            </button>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {timeline.sceneIndex + 1} / {SCENES.length}
            </span>
            <button
              {...DEV_BTN}
              onClick={() => timeline.goToScene(Math.min(SCENES.length - 1, timeline.sceneIndex + 1))}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetrixLogo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex items-center justify-center rounded-[22px]"
        style={{
          width: 72,
          height: 72,
          background: "rgba(82,54,245,0.1)",
          border: "1px solid rgba(82,54,245,0.25)",
          boxShadow: "0 0 32px rgba(82,54,245,0.15)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
          <path
            d="M12 36L18 20L24 30L30 20L36 36"
            stroke="#5236F5"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="13" r="3.5" fill="#5236F5" />
        </svg>
      </div>
      <span className="font-black tracking-[0.24em] uppercase text-white" style={{ fontSize: 14 }}>
        METRIX
      </span>
    </div>
  );
}
