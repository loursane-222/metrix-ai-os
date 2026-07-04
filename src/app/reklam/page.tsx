"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SayfaBir } from "@/components/reklam/SayfaBir";
import { SayfaIki } from "@/components/reklam/SayfaIki";
import { SayfaUc }  from "@/components/reklam/SayfaUc";

type Scene = 0 | 1 | 2 | 3;

const AUDIO_SRCS = [
  "/audio/metrix-reklam-sayfa-1.mp3",
  "/audio/metrix-reklam-sayfa-2.mp3",
  "/audio/metrix-reklam-sayfa-3.mp3",
];

const BG: React.CSSProperties = {
  background: "linear-gradient(160deg, #f9f8f5 0%, #f4f3ef 40%, #f1f0f8 100%)",
};

export default function ReklamPage() {
  const [scene, setScene] = useState<Scene>(0);
  const audios = useRef<HTMLAudioElement[]>([]);

  const handleBaslat = useCallback(() => {
    // Create and prime all audio objects at user-gesture time.
    // Playing at volume 0 then pausing unlocks autoplay for the entire session,
    // so pages 2 and 3 audio will play without requiring another user gesture.
    audios.current = AUDIO_SRCS.map((src) => {
      const a = new Audio(src);
      a.volume = 0;
      const p = a.play();
      if (p) {
        p.then(() => {
          a.pause();
          a.currentTime = 0;
          a.volume = 1;
        }).catch(() => {
          a.volume = 1;
        });
      }
      return a;
    });
    setScene(1);
  }, []);

  const advance = useCallback((from: 1 | 2 | 3) => {
    if (from < 3) setScene((from + 1) as Scene);
    // Scene 3 is the last — film holds on final frame
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <AnimatePresence mode="sync">

        {scene === 0 && (
          <motion.div
            key="start"
            className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none"
            style={BG}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <MetrixLogo />
            <button
              onClick={handleBaslat}
              className="mt-4 px-10 py-4 rounded-2xl font-bold text-[16px] tracking-wide"
              style={{
                color: "#5236F5",
                background: "rgba(82,54,245,0.08)",
                border: "1px solid rgba(82,54,245,0.22)",
              }}
            >
              Başlat
            </button>
            <p className="text-[12px] font-medium" style={{ color: "rgba(100,116,139,0.55)" }}>
              🔊 En iyi deneyim için sesi açın.
            </p>
          </motion.div>
        )}

        {scene === 1 && (
          <motion.div
            key="s1"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <SayfaBir
              filmMode
              audio={audios.current[0]}
              onComplete={() => advance(1)}
            />
          </motion.div>
        )}

        {scene === 2 && (
          <motion.div
            key="s2"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <SayfaIki
              filmMode
              audio={audios.current[1]}
              onComplete={() => advance(2)}
            />
          </motion.div>
        )}

        {scene === 3 && (
          <motion.div
            key="s3"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <SayfaUc
              filmMode
              audio={audios.current[2]}
              onComplete={() => advance(3)}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

function MetrixLogo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="flex items-center justify-center rounded-[28px]"
        style={{
          width: 88,
          height: 88,
          background: "white",
          boxShadow: "0 8px 32px rgba(82,54,245,0.16), 0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="6" width="36" height="36" rx="10" fill="#5236F5" opacity="0.10" />
          <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="14" r="4" fill="#5236F5" />
        </svg>
      </div>
      <span
        className="font-black tracking-[0.22em] uppercase"
        style={{ fontSize: 15, color: "#5236F5" }}
      >
        METRIX
      </span>
    </div>
  );
}
