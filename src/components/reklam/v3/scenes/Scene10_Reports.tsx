"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

// Oca–Haz satış verisi (normalize edilmiş yükseklik, max 44px)
const BARS = [
  { label: "Oca", h: 20 },
  { label: "Şub", h: 27 },
  { label: "Mar", h: 24 },
  { label: "Nis", h: 36 },
  { label: "May", h: 32 },
  { label: "Haz", h: 44 },
] as const;

export function Scene10_Reports({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="10"
      label="Reports"
      bg="linear-gradient(160deg, #040508 0%, #080a12 100%)"
    >
      <div className="flex-1 flex flex-col justify-center gap-4 px-5 py-6">

        {/* Kullanıcı komutu */}
        <motion.div
          className="flex justify-end"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className="px-3 py-1.5 rounded-xl rounded-tr-sm text-[12px] font-light"
            style={{
              background: "rgba(82,54,245,0.14)",
              border: "1px solid rgba(82,54,245,0.28)",
              color: "rgba(255,255,255,0.8)",
            }}
          >
            Ocak–Haziran satış raporunu hazırla.
          </span>
        </motion.div>

        {/* Rapor kartı */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          transition={{ duration: 0.45, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex flex-col gap-3 px-4 py-4 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            }}
          >
            {/* Kart başlığı */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-white text-[13px] font-semibold">Yönetici Satış Raporu</p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Ocak — Haziran 2025
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <p className="text-white text-[15px] font-bold">₺4.2M</p>
                <p className="text-[11px] font-medium" style={{ color: "#30D158" }}>+18% YoY</p>
              </div>
            </div>

            {/* Mini bar chart */}
            <div className="flex flex-col gap-1.5">
              <svg viewBox="0 0 216 56" className="w-full" style={{ height: 48 }}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5236F5" />
                    <stop offset="100%" stopColor="#0A84FF" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {BARS.map((bar, i) => (
                  <motion.rect
                    key={bar.label}
                    x={i * 36 + 4}
                    width={28}
                    rx={4}
                    fill="url(#barGrad)"
                    initial={{ height: 0, y: 50 }}
                    animate={{ height: bar.h, y: 50 - bar.h }}
                    transition={{ duration: 0.4, delay: 0.85 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
              </svg>
              <div className="flex justify-between px-1">
                {BARS.map((b) => (
                  <span key={b.label} className="text-[9px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Risk + Aksiyon */}
            <div
              className="flex flex-col gap-1.5 pt-1 border-t"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-start gap-2">
                <span className="text-[11px] mt-[1px]">⚠️</span>
                <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <span style={{ color: "#FF9500" }}>Risk:</span>{" Q2’de 3 müşteri hesabı kapandı"}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] mt-[1px]">🎯</span>
                <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <span style={{ color: "#0A84FF" }}>Aksiyon:</span> Uzun vadeli sözleşme teklif et
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Metrix kapanış cümlesi */}
        <motion.p
          className="text-[13px] font-light leading-snug text-center"
          style={{ color: "rgba(255,255,255,0.55)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: 2.6 }}
        >
          Sadece raporlamam.{" "}
          <span style={{ color: "rgba(255,255,255,0.85)" }}>
            Ne yapacağınızı da söylerim.
          </span>
        </motion.p>

      </div>
    </SceneShell>
  );
}
