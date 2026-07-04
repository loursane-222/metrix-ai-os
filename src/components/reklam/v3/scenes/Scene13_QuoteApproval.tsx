"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const METRIX_LINES = [
  { text: "Satış kapanana kadar oradayım.", delay: 3.6 },
];

export function Scene13_QuoteApproval({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="13"
      label="Quote Approval"
      bg="linear-gradient(160deg, #040810 0%, #060c18 100%)"
    >
      <div className="flex-1 flex flex-col justify-center gap-3 px-5 py-6">

        {/* 1 — Teklif özet kartı */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex flex-col gap-[2px]">
              <p className="text-white text-[13px] font-medium">Idea Yapı — Teklif</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                ₺245.000 · 5 kalem · Gönderildi
              </p>
            </div>
            <div
              className="px-2 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wide"
              style={{
                background: "rgba(10,132,255,0.15)",
                border: "1px solid rgba(10,132,255,0.3)",
                color: "#0A84FF",
              }}
            >
              Canlı
            </div>
          </div>
        </motion.div>

        {/* 2 — "Müşteri açtı" bildirimi */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(255,149,0,0.08)",
              border: "1px solid rgba(255,149,0,0.25)",
            }}
          >
            <span className="text-base">👁</span>
            <div className="flex flex-col gap-[1px]">
              <p className="text-[12px] font-medium" style={{ color: "#FF9500" }}>
                Müşteri teklifi açtı
              </p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                Idea Yapı · Az önce
              </p>
            </div>
          </div>
        </motion.div>

        {/* 3 — Müşteri sorusu (sağdan) */}
        <motion.div
          className="flex justify-end"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, delay: 2.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%]"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.75)" }}>
              Ödeme koşulları nelerdir?
            </p>
            <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>
              Müşteri
            </p>
          </div>
        </motion.div>

        {/* 4 — Metrix önerisi (soldan) */}
        <motion.div
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 2.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(82,54,245,0.08)",
              border: "1px solid rgba(82,54,245,0.22)",
            }}
          >
            <div
              className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0 mt-[1px]"
              style={{ background: "rgba(82,54,245,0.2)", border: "1px solid rgba(82,54,245,0.35)" }}
            >
              <svg width="11" height="11" viewBox="0 0 48 48" fill="none">
                <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="24" cy="13" r="4.5" fill="#5236F5" />
              </svg>
            </div>
            <div className="flex flex-col gap-[3px]">
              <p className="text-[12px] font-light text-white leading-snug">
                30 gün vadeli ödeme önerilebilir.
              </p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                Teklife eklensin mi?
              </p>
            </div>
          </div>
        </motion.div>

        {/* 5 — Teklif Onaylandı */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 4.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
              background: "rgba(48,209,88,0.1)",
              border: "1px solid rgba(48,209,88,0.3)",
              boxShadow: "0 0 24px rgba(48,209,88,0.08)",
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(48,209,88,0.18)", border: "1px solid rgba(48,209,88,0.35)" }}
            >
              <svg width="16" height="16" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2 2 4-4" stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-[2px]">
              <p className="text-[14px] font-semibold" style={{ color: "#30D158" }}>
                Teklif Onaylandı
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Idea Yapı · ₺245.000
              </p>
            </div>
          </div>
        </motion.div>

        {/* 6 — Metrix kapanış */}
        <div className="flex flex-col gap-1 pl-1">
          {METRIX_LINES.map(({ text, delay }) => (
            <motion.p
              key={text}
              className="text-[13px] font-light leading-snug"
              style={{ color: "rgba(255,255,255,0.5)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.38, delay }}
            >
              {text}
            </motion.p>
          ))}
        </div>

      </div>
    </SceneShell>
  );
}
