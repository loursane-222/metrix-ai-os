"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const SOURCES = [
  { icon: "📊", label: "Excel dosyası",     sub: "Müşteri & sipariş verileri", accent: "#30D158", delay: 0.3  },
  { icon: "🧮", label: "Muhasebe programı", sub: "Fatura & tahsilat geçmişi",  accent: "#0A84FF", delay: 0.65 },
  { icon: "📋", label: "CSV / diğer",       sub: "Stok & ürün kataloğu",       accent: "#FF9500", delay: 1.0  },
] as const;

export function Scene11_Import({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="11"
      label="Import"
      bg="linear-gradient(160deg, #050810 0%, #08101a 100%)"
    >
      <div className="flex-1 flex flex-col justify-center gap-4 px-5 py-6">

        {/* Başlık */}
        <motion.p
          className="text-[11px] font-medium tracking-[0.2em] uppercase"
          style={{ color: "rgba(255,255,255,0.18)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Mevcut verilerinizi getirin
        </motion.p>

        {/* Kaynak satırları */}
        <div className="flex flex-col gap-2">
          {SOURCES.map((src) => (
            <motion.div
              key={src.label}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.32, delay: src.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${src.accent}22`,
                }}
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${src.accent}15`, border: `1px solid ${src.accent}30` }}
                >
                  {src.icon}
                </div>

                <div className="flex flex-col gap-[2px] flex-1 min-w-0">
                  <p className="text-white text-[13px] font-medium leading-tight">{src.label}</p>
                  <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {src.sub}
                  </p>
                </div>

                <motion.div
                  className="flex items-center gap-1.5 flex-shrink-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: src.delay + 0.35 }}
                >
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                    <path d="M1 5h10M8 2l3 3-3 3" stroke={src.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: `${src.accent}18`, border: `1px solid ${src.accent}35` }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke={src.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Onay satırı */}
        <motion.div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
          style={{
            background: "rgba(82,54,245,0.08)",
            border: "1px solid rgba(82,54,245,0.22)",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 1.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(82,54,245,0.2)", border: "1px solid rgba(82,54,245,0.35)" }}
          >
            <svg width="11" height="11" viewBox="0 0 48 48" fill="none">
              <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="13" r="4.5" fill="#5236F5" />
            </svg>
          </div>
          <p className="text-[12px] font-light" style={{ color: "rgba(255,255,255,0.65)" }}>
            {"Tüm verileriniz artık bende."}
          </p>
        </motion.div>

      </div>
    </SceneShell>
  );
}
