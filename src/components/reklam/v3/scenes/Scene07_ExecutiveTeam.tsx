"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const TEAM = [
  { icon: "📊", role: "Finans",             sub: "Gelir · Gider · Risk",         accent: "#0A84FF", delay: 0.7 },
  { icon: "🎯", role: "Satış",              sub: "Teklif · Müşteri · Pipeline",  accent: "#30D158", delay: 1.0 },
  { icon: "⚙️", role: "Operasyon",          sub: "Sipariş · Stok · Teslimat",   accent: "#FF9500", delay: 1.3 },
  { icon: "👥", role: "İnsan Kaynakları",   sub: "Personel · İzin · Performans",accent: "#FF6B35", delay: 1.6 },
  { icon: "🔍", role: "Araştırma",          sub: "Sektör · Haberler · Brifing", accent: "#BF5AF2", delay: 1.9 },
  { icon: "🤝", role: "Yönetici Asistanı", sub: "Takvim · Görev · Takip",      accent: "#5E5CE6", delay: 2.2 },
] as const;

export function Scene07_ExecutiveTeam({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="07"
      label="Executive Team"
      bg="linear-gradient(160deg, #050510 0%, #0a0820 100%)"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-8">

        {/* Başlık */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <p
            className="text-[11px] font-medium tracking-[0.22em] uppercase"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            Altı cephe.
          </p>
          <p className="text-[20px] font-light text-white">Tek merkez.</p>
        </motion.div>

        {/* 2 × 3 grid */}
        <div className="grid grid-cols-2 gap-2.5 w-full">
          {TEAM.map((member) => (
            <motion.div
              key={member.role}
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              transition={{ duration: 0.38, delay: member.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex flex-col gap-2 px-3 py-3 rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${member.accent}28`,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.03)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg"
                  style={{
                    background: `${member.accent}18`,
                    border: `1px solid ${member.accent}33`,
                  }}
                >
                  {member.icon}
                </div>

                <div className="flex flex-col gap-[3px]">
                  <p className="text-white text-[13px] font-medium leading-tight">
                    {member.role}
                  </p>
                  <p className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {member.sub}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 mt-auto">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: member.accent }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: member.delay }}
                  />
                  <span className="text-[9px]" style={{ color: `${member.accent}99` }}>
                    Aktif
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </SceneShell>
  );
}
