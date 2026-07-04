"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

export function Scene02_MetrixIntro({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="02"
      label="Metrix Intro"
      bg="linear-gradient(160deg, #060612 0%, #0a0820 100%)"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">

        {/* Logo S01'in yarım formundan tamamlanır */}
        <motion.div
          className="flex items-center justify-center rounded-[20px]"
          style={{
            width: 60,
            height: 60,
            background: "rgba(82,54,245,0.12)",
            border: "1px solid rgba(82,54,245,0.3)",
          }}
          initial={{ opacity: 0.6, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <motion.path
              d="M12 36L18 20L24 30L30 20L36 36"
              stroke="#5236F5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0.6, opacity: 1 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.circle
              cx="24" cy="13" r="3.5" fill="#5236F5"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </motion.div>

        {/* Metinler sıralı çıkar */}
        <div className="flex flex-col gap-2">
          {[
            { text: "Ben Metrix.",           delay: 0.4,  opacity: 1.0  },
            { text: "Yeni genel müdürünüz.", delay: 1.0,  opacity: 0.65 },
          ].map(({ text, delay, opacity }) => (
            <motion.p
              key={text}
              className="text-[21px] font-light"
              style={{ color: `rgba(255,255,255,${opacity})` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
            >
              {text}
            </motion.p>
          ))}
        </div>

        {/* Sesi açın */}
        <motion.p
          className="text-[11px] font-medium tracking-[0.2em] uppercase"
          style={{ color: "rgba(255,255,255,0.2)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.9 }}
        >
          🔊 Sesi açın
        </motion.p>

      </div>
    </SceneShell>
  );
}
