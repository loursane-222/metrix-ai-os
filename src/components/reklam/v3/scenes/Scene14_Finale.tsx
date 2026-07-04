"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const POWER_LINES = [
  { text: "Ben uyumam.",      delay: 2.0  },
  { text: "Unutmam.",         delay: 2.65 },
  { text: "Takibi bırakmam.", delay: 3.3  },
];

export function Scene14_Finale({ audioEngine: _audio }: SceneProps) {

  return (
    <SceneShell
      sceneNumber="14"
      label="Finale"
      bg="linear-gradient(180deg, #020208 0%, #030312 60%, #020208 100%)"
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(82,54,245,0.07) 0%, transparent 65%)",
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-7 text-center">

        {/* Saat */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <p
            className="text-[48px] font-thin tracking-[0.06em]"
            style={{ color: "rgba(255,255,255,0.9)", fontVariantNumeric: "tabular-nums" }}
          >
            03:17
          </p>
          <motion.div
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 1.1 }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#5236F5" }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span
              className="text-[11px] font-medium tracking-wide"
              style={{ color: "rgba(82,54,245,0.7)" }}
            >
              Metrix çalışıyor
            </span>
          </motion.div>
        </motion.div>

        {/* Güçlü üç satır */}
        <div className="flex flex-col gap-2">
          {POWER_LINES.map(({ text, delay }) => (
            <motion.p
              key={text}
              className="text-[22px] font-light text-white"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
            >
              {text}
            </motion.p>
          ))}
        </div>

        {/* Metrix logo lockup */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 4.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center justify-center rounded-[20px]"
            style={{
              width: 56,
              height: 56,
              background: "rgba(82,54,245,0.12)",
              border: "1px solid rgba(82,54,245,0.35)",
              boxShadow: "0 0 32px rgba(82,54,245,0.2)",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
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
          <div className="flex flex-col items-center gap-1">
            <span
              className="font-black tracking-[0.26em] uppercase text-white"
              style={{ fontSize: 18 }}
            >
              METRIX
            </span>
            <span
              className="text-[11px] font-light tracking-[0.1em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Yapay Zekâ Destekli Dijital Genel Müdür
            </span>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.p
          className="text-[13px] font-light leading-snug"
          style={{ color: "rgba(255,255,255,0.4)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 5.1 }}
        >
          Hazır olduğunuzda,
          <br />
          ben buradayım.
        </motion.p>

      </div>
    </SceneShell>
  );
}
