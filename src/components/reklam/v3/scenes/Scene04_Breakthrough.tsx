"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

export function Scene04_Breakthrough({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="04"
      label="Breakthrough"
      bg="linear-gradient(160deg, #050510 0%, #080818 100%)"
    >
      {/* HARD_CUT sonrası freeze flash — hızlı solar */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ background: "rgba(82,54,245,0.25)" }}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">

        <motion.p
          className="text-sm leading-relaxed"
          style={{ color: "rgba(255,255,255,0.35)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          Güvenebileceğiniz bir ekibiniz yoktu.
        </motion.p>

        <motion.p
          className="text-[24px] font-light text-white"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          Artık var.
        </motion.p>

      </div>
    </SceneShell>
  );
}
