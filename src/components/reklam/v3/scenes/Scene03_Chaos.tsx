"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

// Delay'ler 2.9s sahne süresiyle uyumlu sıkıştırıldı (maks 1.60s)
const CARDS = [
  { icon: "💬", app: "WhatsApp",  title: "Ahmet Bey",        message: "Teklif ne zaman gelecek?",         accent: "#25D366", fromX: "-110%", landX: "-4%", topPct:  6, rotate: -2, delay: 0.10 },
  { icon: "📞", app: "Telefon",   title: "Kaçan Çağrı",      message: "Tedarikçi — 3 kez aradı",          accent: "#FF3B30", fromX:  "110%", landX:  "4%", topPct: 17, rotate:  3, delay: 0.33 },
  { icon: "⚠️", app: "Muhasebe",  title: "Tahsilat Gecikti", message: "Yıldız Ltd. — 45.000 ₺ — 12 gün", accent: "#FF9500", fromX: "-110%", landX: "-3%", topPct: 28, rotate: -2, delay: 0.56 },
  { icon: "👤", app: "Personel",  title: "Ali",              message: "Maaş yatacak mı bu ay?",           accent: "#5E5CE6", fromX:  "110%", landX:  "5%", topPct: 39, rotate:  2, delay: 0.79 },
  { icon: "🚚", app: "Lojistik",  title: "Teslimat Gecikti", message: "Sipariş #2847 — 2 gün rötar",      accent: "#FF6B35", fromX: "-110%", landX: "-4%", topPct: 50, rotate: -3, delay: 1.02 },
  { icon: "📦", app: "Stok",      title: "Stok Azaldı",      message: "Ürün A — yalnızca 3 adet kaldı",  accent: "#FFD60A", fromX:  "110%", landX:  "3%", topPct: 61, rotate:  2, delay: 1.25 },
  { icon: "📅", app: "Takvim",    title: "Takvim Doldu",     message: "17 toplantı — bu hafta",           accent: "#30D158", fromX:    "0%", landX: "-2%", topPct: 72, rotate: -1, delay: 1.48 },
] as const;

export function Scene03_Chaos({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="03"
      label="Chaos"
      bg="linear-gradient(160deg, #0a0505 0%, #140808 100%)"
    >
      {CARDS.map((card) => (
        <motion.div
          key={card.title}
          className="absolute w-[82%]"
          style={{ top: `${card.topPct}%`, left: "9%" }}
          initial={{ x: card.fromX, opacity: 0, rotate: card.rotate * 2.5, filter: "blur(4px)" }}
          animate={{ x: card.landX,  opacity: 1, rotate: card.rotate,       filter: "blur(0px)" }}
          transition={{ duration: 0.38, delay: card.delay, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
            style={{
              background: "rgba(28,28,30,0.92)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${card.accent}22`, border: `1px solid ${card.accent}44` }}
            >
              {card.icon}
            </div>

            <div className="flex flex-col gap-[2px] min-w-0">
              <span
                className="text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: card.accent }}
              >
                {card.app}
              </span>
              <p className="text-white text-[13px] font-medium leading-tight truncate">
                {card.title}
              </p>
              <p className="text-[12px] leading-tight truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                {card.message}
              </p>
            </div>
          </div>
        </motion.div>
      ))}

    </SceneShell>
  );
}
