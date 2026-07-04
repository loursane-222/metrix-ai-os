"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const ITEMS = [
  {
    command:   "Alfa Yapı müşteri oluştur.",
    cmdDelay:  0.5,
    cardDelay: 0.95,
    icon: "👤", accent: "#30D158",
    cardTitle: "Alfa Yapı",
    cardSub:   "Müşteri oluşturuldu",
    cardExtra: "İstanbul · B2B",
  },
  {
    command:   "Idea Yapı teklif hazırla.",
    cmdDelay:  2.1,
    cardDelay: 2.55,
    icon: "📄", accent: "#0A84FF",
    cardTitle: "₺245.000",
    cardSub:   "Idea Yapı — Teklif Taslağı",
    cardExtra: "5 kalem · Geçerlilik: 7 gün",
  },
  {
    command:   "Tahsilat raporu.",
    cmdDelay:  3.6,
    cardDelay: 4.05,
    icon: "⚠️", accent: "#FF9500",
    cardTitle: "3 Riskli Tahsilat",
    cardSub:   "Yıldız Ltd · Özgür AŞ · +1",
    cardExtra: "Toplam: ₺128.500",
  },
] as const;

export function Scene05_VoiceManagement({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="05"
      label="Voice Management"
      bg="linear-gradient(160deg, #040810 0%, #060e1e 100%)"
    >
      <div className="flex-1 flex flex-col justify-center gap-3 px-5 py-6">

        {/* Başlık */}
        <motion.p
          className="text-[10px] font-medium tracking-[0.22em] uppercase text-center mb-1"
          style={{ color: "rgba(255,255,255,0.18)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          Konuşarak yönetirsiniz.
        </motion.p>

        {/* Komut + Sonuç çiftleri */}
        {ITEMS.map((item) => (
          <div key={item.command} className="flex flex-col gap-1.5">

            {/* Kullanıcı komutu — sağa hizalı */}
            <motion.div
              className="flex justify-end"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: item.cmdDelay, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="px-3 py-1.5 rounded-xl rounded-tr-sm text-[12px] font-light"
                style={{
                  background: "rgba(82,54,245,0.14)",
                  border: "1px solid rgba(82,54,245,0.28)",
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {item.command}
              </span>
            </motion.div>

            {/* Sonuç kartı — soldan gelir */}
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: item.cardDelay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${item.accent}33`,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.03)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${item.accent}18`, border: `1px solid ${item.accent}33` }}
                >
                  {item.icon}
                </div>
                <div className="flex flex-col gap-[2px] min-w-0">
                  <p className="text-white text-[13px] font-semibold leading-tight">
                    {item.cardTitle}
                  </p>
                  <p className="text-[11px] leading-tight truncate" style={{ color: item.accent }}>
                    {item.cardSub}
                  </p>
                  <p className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {item.cardExtra}
                  </p>
                </div>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ml-auto"
                  style={{ background: `${item.accent}18`, border: `1px solid ${item.accent}44` }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke={item.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </motion.div>

          </div>
        ))}

        {/* Metrix kapanış */}
        <motion.p
          className="text-[13px] font-light text-center"
          style={{ color: "rgba(255,255,255,0.45)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 4.2 }}
        >
          Diğerlerini ben takip ediyorum.
        </motion.p>

      </div>
    </SceneShell>
  );
}
