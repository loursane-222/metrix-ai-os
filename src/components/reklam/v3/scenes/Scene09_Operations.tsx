"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const OPS = [
  {
    icon: "👥", label: "Personel",
    value: "12 aktif",   alert: "2 izin talebi",
    accent: "#0A84FF",   delay: 0.5,
  },
  {
    icon: "📦", label: "Sipariş",
    value: "8 açık",     alert: "2 gecikmiş",
    accent: "#FF9500",   delay: 0.9,
  },
  {
    icon: "🚚", label: "Teslimat",
    value: "5 yolda",    alert: "1 gecikiyor",
    accent: "#FFD60A",   delay: 1.3,
  },
  {
    icon: "🏭", label: "Stok",
    value: "142 ürün",   alert: "3 kritik seviye",
    accent: "#FF3B30",   delay: 1.7,
  },
  {
    icon: "💰", label: "Tahsilat",
    value: "₺284.000",  alert: "5 gecikmiş hesap",
    accent: "#30D158",   delay: 2.1,
  },
] as const;

export function Scene09_Operations({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="09"
      label="Operations"
      bg="linear-gradient(160deg, #050810 0%, #080e1a 100%)"
    >
      <div className="flex-1 flex flex-col gap-4 px-5 py-6 justify-center">

        {/* Başlık */}
        <motion.p
          className="text-[11px] font-medium tracking-[0.22em] uppercase"
          style={{ color: "rgba(255,255,255,0.18)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          Operasyon — Anlık Durum
        </motion.p>

        {/* Operasyon kartları */}
        <div className="flex flex-col gap-2">
          {OPS.map((op) => (
            <motion.div
              key={op.label}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: op.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${op.accent}22`,
                }}
              >
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${op.accent}15`, border: `1px solid ${op.accent}30` }}
                >
                  {op.icon}
                </div>

                <div className="flex flex-col gap-[2px] flex-1 min-w-0">
                  <p
                    className="text-[11px] font-medium tracking-wide uppercase"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    {op.label}
                  </p>
                  <p className="text-white text-[15px] font-semibold leading-tight">
                    {op.value}
                  </p>
                </div>

                <div
                  className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium"
                  style={{
                    background: `${op.accent}15`,
                    border: `1px solid ${op.accent}35`,
                    color: op.accent,
                  }}
                >
                  {op.alert}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Alt zaman damgası */}
        <motion.p
          className="text-[10px] text-right"
          style={{ color: "rgba(255,255,255,0.15)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 3.0 }}
        >
          Son güncelleme: şimdi
        </motion.p>

      </div>
    </SceneShell>
  );
}
