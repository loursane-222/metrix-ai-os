"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

export function Scene01_Hook({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="01"
      label="Hook"
      bg="linear-gradient(160deg, #080808 0%, #0f0a1e 100%)"
    >
      {/* Bass hit — radial pulse, hızlı solar */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(82,54,245,0.45) 0%, transparent 60%)",
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <motion.p
          className="text-[20px] font-light leading-snug"
          style={{ color: "rgba(255,255,255,0.85)" }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          Şirketinizi yönetecek bir genel müdürünüz olsaydı?
        </motion.p>

        {/* Metrix logosu — sahne sonunda belirmeye başlar, Scene02'ye devredilir */}
        <motion.div
          className="mt-4 flex items-center justify-center rounded-[20px]"
          style={{
            width: 60,
            height: 60,
            background: "rgba(82,54,245,0.08)",
            border: "1px solid rgba(82,54,245,0.2)",
          }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 0.6, scale: 0.9 }}
          transition={{ duration: 0.5, delay: 1.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <motion.path
              d="M12 36L18 20L24 30L30 20L36 36"
              stroke="#5236F5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 0.6, opacity: 1 }}
              transition={{ duration: 0.6, delay: 2.1, ease: "easeOut" }}
            />
          </svg>
        </motion.div>
      </div>
    </SceneShell>
  );
}
