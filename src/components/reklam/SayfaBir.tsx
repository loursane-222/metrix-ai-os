"use client";

import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const AUDIO_SRC = "/audio/metrix-reklam-sayfa-1.mp3";
const ANIM_DURATION_MS = 16300;
const VACUUM_MS   = 15800;
const APPROACH_MS = 14500;
const TITLE_DELAY = 2.0;
const LOGO_OUT_MS = 3800;

// Delays tuned to match narration in metrix-reklam-sayfa-1.mp3 (~15.8s total)
// Each card appears ~0.5s after the narrator mentions its topic
const CARDS = [
  { id: 1, label: "Teklif Bekliyor",    icon: "📄", color: "#5236F5", delay: 3.5  },
  { id: 2, label: "Tahsilat Gecikti",   icon: "⚠️", color: "#E5394B", delay: 5.0  },
  { id: 3, label: "Müşteri Bekliyor",   icon: "👤", color: "#2563EB", delay: 6.5  },
  { id: 4, label: "Personel Sorusu",    icon: "💬", color: "#7C3AED", delay: 8.0  },
  { id: 5, label: "Bugün Yapılacaklar", icon: "✓",  color: "#059669", delay: 9.5  },
];

const LAYERS = [
  { id: "excel", delay: 11.8, dir: "bottomLeft" },
  { id: "crm",   delay: 12.4, dir: "topRight"   },
  { id: "erp",   delay: 12.9, dir: "left"       },
  { id: "mail",  delay: 13.4, dir: "top"        },
  { id: "msg",   delay: 14.0, dir: "right"      },
];

const BG_STYLE: React.CSSProperties = {
  background: "linear-gradient(160deg, #f9f8f5 0%, #f4f3ef 40%, #f1f0f8 100%)",
};

type Phase = "idle" | "playing" | "done";

type Props = {
  onDevam?: () => void;
  filmMode?: boolean;
  audio?: HTMLAudioElement;
  onComplete?: () => void;
};

export function SayfaBir({ onDevam, filmMode, audio: passedAudio, onComplete }: Props = {}) {
  // In filmMode start directly in "playing" to avoid one-frame StartScreen flash
  const [phase, setPhase]     = useState<Phase>(filmMode ? "playing" : "idle");
  const [animKey, setAnimKey] = useState(0);
  const timers      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const animDone    = useRef(false);
  const audioDone   = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  function markDone() {
    if (animDone.current && audioDone.current) {
      if (filmMode) {
        onCompleteRef.current?.();
      } else {
        setPhase("done");
      }
    }
  }

  // ── Standalone start (button click) ──────────────────────────────────────
  function handleStart() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    animDone.current = false;
    audioDone.current = false;
    setPhase("playing");
    setAnimKey((k) => k + 1);

    const audio = new Audio(AUDIO_SRC);
    audioRef.current = audio;
    audio.addEventListener("ended", () => { audioDone.current = true; markDone(); });
    audio.addEventListener("error", () => { audioDone.current = true; markDone(); });
    audio.play().catch(() => { audioDone.current = true; markDone(); });
    timers.current.push(setTimeout(() => { animDone.current = true; markDone(); }, ANIM_DURATION_MS));
  }

  // ── Film-mode startup & cleanup ───────────────────────────────────────────
  useEffect(() => {
    if (filmMode) {
      animDone.current  = false;
      audioDone.current = false;

      const audio = passedAudio ?? new Audio(AUDIO_SRC);
      audioRef.current = audio;
      if (passedAudio) { passedAudio.currentTime = 0; passedAudio.volume = 1; }

      const onEnded = () => { audioDone.current = true; markDone(); };
      const onError = () => { audioDone.current = true; markDone(); };
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
      audio.play().catch(() => { audioDone.current = true; markDone(); });

      const t = setTimeout(() => { animDone.current = true; markDone(); }, ANIM_DURATION_MS);

      return () => {
        clearTimeout(t);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        audio.pause();
        if (!passedAudio) audio.src = "";
      };
    }

    // Standalone cleanup
    return () => {
      timers.current.forEach(clearTimeout);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") return <StartScreen onStart={handleStart} />;
  if (phase === "done") return <DevamEkrani onRestart={handleStart} onDevam={onDevam} />;
  return <AnimasyonSahnesi key={animKey} />;
}

/* ─── Start screen ─── */
function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none" style={BG_STYLE}>
      <MetrixLogo />
      <button
        onClick={onStart}
        className="mt-4 px-8 py-4 rounded-2xl font-bold text-[15px] tracking-wide"
        style={{
          color: "#5236F5",
          background: "rgba(82,54,245,0.08)",
          border: "1px solid rgba(82,54,245,0.22)",
        }}
      >
        Reklamı Başlat
      </button>
    </div>
  );
}

/* ─── Done / CTA screen ─── */
function DevamEkrani({ onRestart, onDevam }: { onRestart: () => void; onDevam?: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center gap-10 select-none"
      style={BG_STYLE}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <MetrixLogo />
      <div className="flex flex-col items-center gap-4 w-full px-8">
        <button
          onClick={onDevam}
          className="w-full max-w-[320px] py-4 rounded-2xl font-black text-white text-[17px] tracking-tight"
          style={{
            background: "linear-gradient(135deg, #5236F5 0%, #7C3AED 100%)",
            boxShadow: "0 18px 40px rgba(82,54,245,0.25)",
          }}
        >
          Devam
        </button>
        <button onClick={onRestart} className="text-[13px] font-medium py-2" style={{ color: "#aaa" }}>
          Yeniden izle
        </button>
      </div>
    </motion.div>
  );
}

const CLOSING_MS = 11000; // "Çünkü her küçük iş, senden zaman istiyor."

/* ─── Animation scene ─── */
function AnimasyonSahnesi() {
  const [vacuum,      setVacuum]      = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const shakeControls = useAnimation();
  const layerControls = useAnimation();
  const logoControls  = useAnimation();

  useEffect(() => {
    logoControls.start({ opacity: 1, scale: 1, transition: { duration: 1.2, ease: "easeOut" } });

    const tLogoOut = setTimeout(() => {
      logoControls.start({
        opacity: 0,
        scale: 0.92,
        transition: { duration: 0.6, ease: [0.4, 0, 0.6, 1] },
      });
    }, LOGO_OUT_MS);

    const tClosing = setTimeout(() => setShowClosing(true), CLOSING_MS);

    const t1 = setTimeout(() => {
      shakeControls.start({
        x: [0, -4, 4, -3, 3, -2, 2, -1, 1, 0],
        transition: { duration: 0.55, repeat: Infinity, repeatDelay: 0.15, ease: "easeInOut" },
      });
      layerControls.start({ scale: 1.06, transition: { duration: 1.0, ease: "easeIn" } });
    }, APPROACH_MS);

    const t2 = setTimeout(() => setVacuum(true), VACUUM_MS);

    return () => { clearTimeout(tLogoOut); clearTimeout(tClosing); clearTimeout(t1); clearTimeout(t2); };
  }, [logoControls, shakeControls, layerControls]);

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={BG_STYLE}>
      <motion.div
        className="relative w-full h-full"
        animate={vacuum ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={vacuum ? { duration: 0.38, ease: [0.6, 0, 1, 0.6] } : undefined}
      >
        {/* Subtle warm gradient overlay — phase 2 */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: TITLE_DELAY, duration: 1.2 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 30% 40%, rgba(82,54,245,0.06) 0%, transparent 70%), " +
                "radial-gradient(ellipse 60% 80% at 70% 60%, rgba(229,57,75,0.03) 0%, transparent 70%)",
            }}
          />
        </motion.div>

        {/* Background app layers — phase 4 */}
        <motion.div className="absolute inset-0 pointer-events-none" animate={layerControls}>
          {LAYERS.map((layer) => (
            <motion.div
              key={layer.id}
              className="absolute inset-4"
              initial={layerInitial(layer.dir)}
              animate={layerFinal(layer.dir)}
              transition={{ delay: layer.delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <AppLayerPanel id={layer.id} />
            </motion.div>
          ))}
        </motion.div>

        {/* Shake wrapper */}
        <motion.div className="absolute inset-0" animate={shakeControls}>

          {/* Logo + intro */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={logoControls}
          >
            <MetrixLogo />
            <div className="flex flex-col items-center gap-1">
              <motion.p
                className="font-medium tracking-wide"
                style={{ color: "rgba(26,20,56,0.55)", fontSize: 16 }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3, duration: 0.8, ease: "easeOut" }}
              >
                Merhaba.
              </motion.p>
              <motion.p
                className="font-normal tracking-wide"
                style={{ color: "rgba(26,20,56,0.35)", fontSize: 14 }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.9, duration: 0.8, ease: "easeOut" }}
              >
                Ben Metrix.
              </motion.p>
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            className="absolute inset-x-0 top-[38%] px-8"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: TITLE_DELAY, duration: 1.4, ease: "easeOut" }}
          >
            <h1
              className="text-center font-black leading-tight tracking-tight"
              style={{ fontSize: "clamp(26px,7vw,32px)", color: "#1a1438" }}
            >
              Şirket yönetmek
              <br />
              zaten yeterince zor.
            </h1>
          </motion.div>

          {/* Closing line — appears after all cards, before chaos */}
          {showClosing && (
            <motion.div
              className="absolute inset-x-0 bottom-[22%] px-8"
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              <p
                className="text-center font-semibold leading-snug"
                style={{ fontSize: "clamp(15px,4.5vw,18px)", color: "rgba(26,20,56,0.55)" }}
              >
                Çünkü her küçük iş,
                <br />
                senden zaman istiyor.
              </p>
            </motion.div>
          )}

          {/* Notification cards */}
          <div className="absolute top-16 inset-x-0 flex flex-col items-center px-4 gap-2">
            {CARDS.map((card, i) => (
              <motion.div
                key={card.id}
                className="w-full max-w-[340px]"
                style={{ zIndex: i + 10 }}
                initial={{ x: 380, y: -80, opacity: 0, scale: 0.88 }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                transition={{
                  delay: card.delay,
                  type: "spring",
                  stiffness: 320,
                  damping: 28,
                  mass: 0.9,
                }}
              >
                <NotificationCard label={card.label} icon={card.icon} accentColor={card.color} />
              </motion.div>
            ))}
          </div>

        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Layer helpers ─── */
function layerInitial(dir: string) {
  switch (dir) {
    case "bottomLeft": return { x: -320, y: 300,  rotate: -8, opacity: 0, scale: 0.85 };
    case "topRight":   return { x: 320,  y: -300, rotate: 6,  opacity: 0, scale: 0.85 };
    case "left":       return { x: -360, y: 40,   rotate: -4, opacity: 0, scale: 0.85 };
    case "top":        return { x: 40,   y: -320, rotate: 3,  opacity: 0, scale: 0.85 };
    case "right":      return { x: 360,  y: -20,  rotate: 5,  opacity: 0, scale: 0.85 };
    default:           return { x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.85 };
  }
}

function layerFinal(dir: string) {
  switch (dir) {
    case "bottomLeft": return { x: -60, y: 60,   rotate: -6, opacity: 0.88, scale: 1 };
    case "topRight":   return { x: 50,  y: -55,  rotate: 4,  opacity: 0.84, scale: 1 };
    case "left":       return { x: -40, y: 20,   rotate: -3, opacity: 0.80, scale: 1 };
    case "top":        return { x: 20,  y: -40,  rotate: 2,  opacity: 0.84, scale: 1 };
    case "right":      return { x: 55,  y: 10,   rotate: 5,  opacity: 0.82, scale: 1 };
    default:           return { x: 0, y: 0, rotate: 0, opacity: 0.8, scale: 1 };
  }
}

/* ─── Sub-components ─── */

function MetrixLogo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="flex items-center justify-center rounded-[28px]"
        style={{
          width: 88,
          height: 88,
          background: "white",
          boxShadow: "0 8px 32px rgba(82,54,245,0.16), 0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="6" width="36" height="36" rx="10" fill="#5236F5" opacity="0.10" />
          <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="14" r="4" fill="#5236F5" />
        </svg>
      </div>
      <span
        className="font-black tracking-[0.22em] uppercase"
        style={{ fontSize: 15, color: "#5236F5" }}
      >
        METRIX
      </span>
    </div>
  );
}

function NotificationCard({ label, icon, accentColor }: { label: string; icon: string; accentColor: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.09), 0 1px 0 rgba(255,255,255,0.9) inset",
      }}
    >
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{ width: 38, height: 38, background: `${accentColor}14`, border: `1px solid ${accentColor}28` }}
      >
        <span style={{ fontSize: 17 }}>{icon}</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-semibold text-[14px] leading-tight truncate" style={{ color: "#1a1438" }}>{label}</span>
        <span className="text-[12px] mt-0.5" style={{ color: "#aaa" }}>şimdi</span>
      </div>
      <div
        className="ml-auto w-2 h-2 rounded-full shrink-0"
        style={{ background: accentColor }}
      />
    </div>
  );
}

function AppLayerPanel({ id }: { id: string }) {
  const panelStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(0,0,0,0.07)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
    borderRadius: "1rem",
    overflow: "hidden",
    width: "100%",
    height: "100%",
  };
  if (id === "excel") return <div style={panelStyle}><SpreadsheetMock /></div>;
  if (id === "crm")   return <div style={panelStyle}><CRMMock /></div>;
  if (id === "erp")   return <div style={panelStyle}><ERPMock /></div>;
  if (id === "mail")  return <div style={panelStyle}><MailMock /></div>;
  return                     <div style={panelStyle}><MessagingMock /></div>;
}

function SpreadsheetMock() {
  const cols = ["A", "B", "C", "D", "E", "F"];
  const rows = [
    ["Ocak",    "124.500", "98.200",  "26.300", "%21", "✓"],
    ["Şubat",   "138.000", "112.400", "25.600", "%19", "✓"],
    ["Mart",    "156.200", "118.900", "37.300", "%24", "●"],
    ["Nisan",   "143.800", "122.100", "21.700", "%15", "—"],
    ["Mayıs",   "167.400", "134.600", "32.800", "%20", "—"],
    ["Haziran", "—",       "—",       "—",      "—",   "—"],
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] ml-2" style={{ color: "#bbb" }}>gelir_gider_2024.xlsx</span>
      </div>
      <div className="flex-1 overflow-hidden p-1">
        <div className="flex" style={{ borderBottom: "1px solid #f0eeec" }}>
          <div className="w-8 shrink-0" />
          {cols.map((c) => <div key={c} className="flex-1 text-center text-[10px] py-1 font-mono" style={{ color: "#ccc" }}>{c}</div>)}
        </div>
        {rows.map((row, i) => (
          <div key={i} className="flex" style={{ borderBottom: "1px solid #f5f4f2" }}>
            <div className="w-8 shrink-0 text-[10px] text-center py-1 font-mono" style={{ color: "#ccc" }}>{i + 1}</div>
            {row.map((cell, j) => <div key={j} className="flex-1 text-[10px] py-1 px-1 font-mono truncate" style={{ color: "#888" }}>{cell}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function CRMMock() {
  const contacts = [
    { name: "Ahmet Yılmaz", company: "Yılmaz İnşaat",  status: "Aktif",    value: "₺84K"  },
    { name: "Selin Kara",   company: "Kara Tekstil",    status: "Bekliyor", value: "₺52K"  },
    { name: "Murat Demir",  company: "Demir Lojistik",  status: "Kapalı",   value: "₺120K" },
    { name: "Fatma Çelik",  company: "Çelik Gıda",      status: "Aktif",    value: "₺38K"  },
    { name: "Emre Şahin",   company: "Şahin Turizm",    status: "Bekliyor", value: "₺67K"  },
  ];
  const statusColor: Record<string, string> = { Aktif: "#16a34a", Bekliyor: "#d97706", Kapalı: "#9ca3af" };
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] ml-2" style={{ color: "#bbb" }}>Müşteri Yönetimi</span>
      </div>
      <div className="flex-1 overflow-hidden px-3 py-2 flex flex-col gap-2">
        {contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(82,54,245,0.08)" }}>
              <span className="text-[10px] font-bold" style={{ color: "#5236F5" }}>{c.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate" style={{ color: "#444" }}>{c.name}</div>
              <div className="text-[10px] truncate" style={{ color: "#bbb" }}>{c.company}</div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-semibold" style={{ color: "#666" }}>{c.value}</span>
              <span className="text-[9px] font-medium" style={{ color: statusColor[c.status] }}>{c.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ERPMock() {
  const metrics = [
    { label: "Stok Değeri",     value: "₺1.24M", change: "+3.2%", up: true  },
    { label: "Açık Siparişler", value: "47",      change: "+8",    up: false },
    { label: "Faturalar",       value: "₺438K",  change: "-2.1%", up: true  },
    { label: "Gider",           value: "₺312K",  change: "+5.4%", up: false },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] ml-2" style={{ color: "#bbb" }}>ERP — Genel Bakış</span>
      </div>
      <div className="flex-1 p-3 grid grid-cols-2 gap-2 content-start">
        {metrics.map((m, i) => (
          <div key={i} className="rounded-xl p-2.5 flex flex-col gap-1" style={{ background: "rgba(0,0,0,0.03)" }}>
            <span className="text-[10px]" style={{ color: "#bbb" }}>{m.label}</span>
            <span className="text-[15px] font-bold font-mono" style={{ color: "#333" }}>{m.value}</span>
            <span className="text-[10px] font-medium" style={{ color: m.up ? "#16a34a" : "#dc2626" }}>{m.change}</span>
          </div>
        ))}
        <div className="col-span-2 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,0.03)" }}>
          <div className="text-[10px] mb-1.5" style={{ color: "#bbb" }}>Aylık Ciro</div>
          <div className="flex items-end gap-1 h-12">
            {[40, 55, 48, 70, 62, 80, 75].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: "rgba(82,54,245,0.22)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MailMock() {
  const mails = [
    { from: "Ahmet B.",  subject: "Teklif için bilgi talebi",       time: "09:14", unread: true  },
    { from: "Muhasebe",  subject: "Aylık rapor — Haziran",          time: "08:52", unread: true  },
    { from: "Selin K.",  subject: "Re: Toplantı saati hakkında",    time: "Dün",   unread: false },
    { from: "Banka",     subject: "Hesap ekstresi hazır",           time: "Dün",   unread: false },
    { from: "Emre Ş.",   subject: "Yeni müşteri tanıtım sunumu",    time: "Pzt",   unread: false },
    { from: "Lojistik",  subject: "Kargo takip no: 74291884",       time: "Pzt",   unread: false },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] ml-2" style={{ color: "#bbb" }}>Gelen Kutusu — 12 Okunmamış</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {mails.map((m, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3 py-2.5"
            style={{
              borderBottom: "1px solid rgba(0,0,0,0.04)",
              background: m.unread ? "rgba(82,54,245,0.03)" : "transparent",
            }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "rgba(82,54,245,0.08)" }}
            >
              <span className="text-[9px] font-bold" style={{ color: "#5236F5" }}>{m.from[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] truncate" style={{ color: m.unread ? "#222" : "#aaa", fontWeight: m.unread ? 600 : 400 }}>{m.from}</span>
                <span className="text-[10px] shrink-0" style={{ color: "#ccc" }}>{m.time}</span>
              </div>
              <div className="text-[10px] truncate mt-0.5" style={{ color: m.unread ? "#666" : "#bbb" }}>{m.subject}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagingMock() {
  const messages = [
    { text: "Fatura onaylandı mı acaba?",                  mine: false, time: "09:02" },
    { text: "Bakıyorum şimdi...",                           mine: true,  time: "09:04" },
    { text: "Müşteri bekliyor sabahtan beri",               mine: false, time: "09:05" },
    { text: "Muhasebeden yanıt gelmedi henüz",              mine: true,  time: "09:07" },
    { text: "Bir de toplantı var 10'da, hazırlandınız mı?", mine: false, time: "09:08" },
    { text: "Hangi toplantı? 😅",                           mine: true,  time: "09:09" },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] ml-2" style={{ color: "#bbb" }}>#genel — Ekip</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col gap-2 p-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[75%] px-3 py-1.5"
              style={{
                background: m.mine ? "rgba(82,54,245,0.10)" : "rgba(0,0,0,0.05)",
                borderRadius: m.mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              }}
            >
              <div className="text-[11px]" style={{ color: m.mine ? "#5236F5" : "#555" }}>{m.text}</div>
              <div className="text-[9px] mt-0.5 text-right" style={{ color: "#ccc" }}>{m.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
