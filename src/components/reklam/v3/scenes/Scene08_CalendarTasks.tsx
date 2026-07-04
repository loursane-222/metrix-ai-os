"use client";

import { motion } from "framer-motion";
import { SceneShell } from "../shared/SceneShell";
import type { SceneProps } from "../types";

const DAYS = [
  { label: "Pzt", date: 16, dot: false },
  { label: "Sal", date: 17, dot: true  },
  { label: "Çar", date: 18, dot: false, today: true },
  { label: "Per", date: 19, dot: true  },
  { label: "Cum", date: 20, dot: true  },
  { label: "Cmt", date: 21, dot: false },
  { label: "Paz", date: 22, dot: false },
] as const;

const TASKS = [
  { icon: "📅", title: "Idea Yapı görüşmesi",   meta: "Bugün · 14:30",            status: "done",    delay: 0.7 },
  { icon: "📋", title: "Teklif gönder",          meta: "Yarın · Bekliyor",         status: "pending", delay: 1.2 },
  { icon: "🔔", title: "Tahsilat hatırlatması",  meta: "3 gün kaldı · Yıldız Ltd", status: "pending", delay: 1.7 },
] as const;

const METRIX_LINES = [
  { text: "Hatırlarım.",   delay: 2.4 },
  { text: "Takip ederim.", delay: 3.0 },
  { text: "Bildiririm.",   delay: 3.6 },
];

export function Scene08_CalendarTasks({ audioEngine: _audio }: SceneProps) {
  return (
    <SceneShell
      sceneNumber="08"
      label="Calendar & Tasks"
      bg="linear-gradient(160deg, #040810 0%, #060f18 100%)"
    >
      <div className="flex-1 flex flex-col gap-4 px-5 py-6 justify-center">

        {/* Takvim şeridi */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex justify-between px-3 py-2.5 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {DAYS.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-medium" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {d.label}
                </span>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium"
                  style={
                    "today" in d && d.today
                      ? { background: "#5236F5", color: "#fff" }
                      : { color: "rgba(255,255,255,0.55)" }
                  }
                >
                  {d.date}
                </div>
                <div
                  className="w-1 h-1 rounded-full"
                  style={{ background: d.dot ? "#5236F5" : "transparent" }}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Görevler */}
        <div className="flex flex-col gap-2">
          {TASKS.map((task) => (
            <motion.div
              key={task.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: task.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <span className="text-base">{task.icon}</span>
                <div className="flex flex-col gap-[2px] flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium leading-tight"
                    style={{
                      color: task.status === "done" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)",
                      textDecoration: task.status === "done" ? "line-through" : "none",
                    }}
                  >
                    {task.title}
                  </p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                    {task.meta}
                  </p>
                </div>
                {task.status === "done" && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(48,209,88,0.15)", border: "1px solid rgba(48,209,88,0.3)" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tamamlandı bildirimi */}
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          transition={{ duration: 0.4, delay: 2.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(48,209,88,0.08)",
              border: "1px solid rgba(48,209,88,0.25)",
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(48,209,88,0.15)" }}
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2 2 4-4" stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-[1px]">
              <p className="text-[12px] font-medium" style={{ color: "#30D158" }}>Tamamlandı</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                Idea Yapı görüşmesi kapatıldı
              </p>
            </div>
          </div>
        </motion.div>

        {/* Metrix yanıtı */}
        <div className="flex flex-col gap-1 pl-1">
          {METRIX_LINES.map(({ text, delay }) => (
            <motion.p
              key={text}
              className="text-[14px] font-light"
              style={{ color: "rgba(255,255,255,0.6)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay }}
            >
              {text}
            </motion.p>
          ))}
        </div>

      </div>
    </SceneShell>
  );
}
