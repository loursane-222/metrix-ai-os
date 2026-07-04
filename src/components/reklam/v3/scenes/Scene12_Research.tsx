"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const INTEL = [
  {
    icon: "📈",
    category: "Ekonomi",
    headline: "Döviz hareketleri takip edildi",
    sub: "Kur ve enflasyon verileri güncellendi",
    accent: "#30D158",
    delay: 0.55,
  },
  {
    icon: "🏭",
    category: "Sektör",
    headline: "Sektörel maliyet artışı incelendi",
    sub: "Tedarik zinciri ve hammadde analizi",
    accent: "#FF9500",
    delay: 1.0,
  },
  {
    icon: "📰",
    category: "Haberler",
    headline: "Yerel ve global haberler tarandı",
    sub: "İş dünyasını etkileyen gelişmeler",
    accent: "#0A84FF",
    delay: 1.45,
  },
] as const;

const METRIX_LINES = [
  { text: "Şirketinizi değil, dünyayı da takip ederim.", delay: 2.5 },
];

export function Scene12_Research({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="12"
      label="Research"
      bg="linear-gradient(160deg, #040810 0%, #060e1a 100%)"
    >
      <div className="flex-1 flex flex-col justify-center gap-3.5 px-5 py-6">

        {/* Brifing başlığı */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-white text-[15px] font-medium">Günlük Brifing</p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Her sabah 07:00
            </p>
          </div>
          <div
            className="px-2 py-1 rounded-lg text-[9px] font-semibold tracking-wider uppercase"
            style={{
              background: "rgba(82,54,245,0.15)",
              border: "1px solid rgba(82,54,245,0.3)",
              color: "#5236F5",
            }}
          >
            Otomatik
          </div>
        </motion.div>

        {/* İstihbarat öğeleri */}
        <div className="flex flex-col gap-2">
          {INTEL.map((item) => (
            <motion.div
              key={item.category}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: item.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${item.accent}20`,
                }}
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                  style={{ background: `${item.accent}15`, border: `1px solid ${item.accent}28` }}
                >
                  {item.icon}
                </div>
                <div className="flex flex-col gap-[3px] min-w-0">
                  <span
                    className="text-[9px] font-semibold tracking-[0.16em] uppercase"
                    style={{ color: item.accent }}
                  >
                    {item.category}
                  </span>
                  <p className="text-white text-[12px] font-medium leading-snug">
                    {item.headline}
                  </p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                    {item.sub}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* İçgörü kartı */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 2.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-start gap-2.5 px-3 py-3 rounded-xl"
            style={{
              background: "rgba(82,54,245,0.07)",
              border: "1px solid rgba(82,54,245,0.2)",
            }}
          >
            <span className="text-sm mt-[1px] flex-shrink-0">🧠</span>
            <div className="flex flex-col gap-[3px]">
              <span
                className="text-[9px] font-semibold tracking-[0.16em] uppercase"
                style={{ color: "#5236F5" }}
              >
                Bugünkü Öneri
              </span>
              <p className="text-[12px] font-light leading-snug" style={{ color: "rgba(255,255,255,0.7)" }}>
                Tahsilat riskini azalt, teklif kapanışlarını hızlandır.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Metrix sözü */}
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
