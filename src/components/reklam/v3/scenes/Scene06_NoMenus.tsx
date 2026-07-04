"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const GHOST_MENU = [
  { label: "Müşteriler", sub: ["Listele", "Ekle", "Filtrele", "Raporla"] },
  { label: "Finansal",   sub: ["Teklif", "Fatura", "Tahsilat", "Gider"] },
  { label: "Operasyon",  sub: ["Sipariş", "Teslimat", "Stok", "Personel"] },
];

export function Scene06_NoMenus({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="06"
      label="No Menus"
      bg="linear-gradient(160deg, #050505 0%, #0a0a0a 100%)"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">

        {/* Hayalet menü — belirir, sonra solar */}
        <motion.div
          className="w-full flex flex-col gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.22, 0] }}
          transition={{ duration: 2.2, delay: 0.2, times: [0, 0.35, 1] }}
        >
          {GHOST_MENU.map(({ label, sub }) => (
            <div key={label} className="flex flex-col gap-1">
              <div
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium w-full"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {label}
              </div>
              <div className="flex gap-1.5 pl-3 flex-wrap">
                {sub.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-1 rounded text-[10px]"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </motion.div>

        <motion.p
          className="text-[18px] font-light text-center"
          style={{ color: "rgba(255,255,255,0.85)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Menülere gerek yok.
        </motion.p>

        {/* Komut satırı */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 2.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
              background: "rgba(82,54,245,0.1)",
              border: "1px solid rgba(82,54,245,0.3)",
              boxShadow: "0 0 24px rgba(82,54,245,0.12)",
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(82,54,245,0.2)", border: "1px solid rgba(82,54,245,0.4)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="#5236F5" />
                <path d="M5 11a7 7 0 0014 0" stroke="#5236F5" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="12" y1="18" x2="12" y2="21" stroke="#5236F5" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-[13px] font-light" style={{ color: "rgba(255,255,255,0.55)" }}>
              Bana söylersiniz.
            </p>
            <motion.div
              className="ml-auto w-1.5 h-1.5 rounded-full"
              style={{ background: "#5236F5" }}
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>

      </div>
    </SceneShell>
  );
}
