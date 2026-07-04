"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const AUDIO_SRC = "/audio/metrix-reklam-sayfa-2.mp3";
const ANIM_DURATION_MS = 15000;

// Audio structure (new recording):
//   0.0s → "Oysa bunları yapmak için menülerde dolaşmana gerek yok." (~3.2s)
//   3.5s → "Yeni müşteri açmak için form doldurmana gerek yok. Bana söylemen yeterli." (~4.0s)
// Total: ~8s narration. Timings below are from scene start (ms).
const FORM_IN_MS     = 600;
const AUDIO_START_MS = 600;   // audio fires early; first sentence covers the title on screen
const FORM_OUT_MS    = 4000;  // form exits just as first sentence ends
const CHAT_IN_MS     = 4800;  // chat rises while title still visible
const TITLE_OUT_MS   = 5600;  // title fades after chat is established
const MSG0_MS        = 5400;  // "form doldurmana gerek yok" — echoes audio's second sentence
const MSG1_MS        = 7600;  // user message
const MSG2_MS        = 9100;  // Metrix confirms
const PUNCHLINE_MS   = 10200;
const CTA_MS         = 11200;

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

export function SayfaIki({ onDevam, filmMode, audio: passedAudio, onComplete }: Props = {}) {
  const [phase, setPhase]     = useState<Phase>(filmMode ? "playing" : "idle");
  const [animKey, setAnimKey] = useState(0);
  const timers    = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const animDone  = useRef(false);
  const audioDone = useRef(false);
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
    animDone.current  = false;
    audioDone.current = false;
    setPhase("playing");
    setAnimKey((k) => k + 1);

    const t0 = setTimeout(() => {
      const audio = new Audio(AUDIO_SRC);
      audioRef.current = audio;
      audio.addEventListener("ended", () => { audioDone.current = true; markDone(); });
      audio.addEventListener("error", () => { audioDone.current = true; markDone(); });
      audio.play().catch(() => { audioDone.current = true; markDone(); });
    }, AUDIO_START_MS);

    timers.current.push(t0);
    timers.current.push(setTimeout(() => { animDone.current = true; markDone(); }, ANIM_DURATION_MS));
  }

  // ── Film-mode startup & cleanup ───────────────────────────────────────────
  useEffect(() => {
    if (filmMode) {
      animDone.current  = false;
      audioDone.current = false;

      const t0 = setTimeout(() => {
        const audio = passedAudio ?? new Audio(AUDIO_SRC);
        audioRef.current = audio;
        if (passedAudio) { passedAudio.currentTime = 0; passedAudio.volume = 1; }

        const onEnded = () => { audioDone.current = true; markDone(); };
        const onError = () => { audioDone.current = true; markDone(); };
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.play().catch(() => { audioDone.current = true; markDone(); });

        // Store refs so cleanup can reach them
        audioRef.current = audio;
        (audioRef as React.MutableRefObject<HTMLAudioElement & { _onEnded?: () => void; _onError?: () => void }>).current._onEnded = onEnded;
        (audioRef as React.MutableRefObject<HTMLAudioElement & { _onEnded?: () => void; _onError?: () => void }>).current._onError = onError;
      }, AUDIO_START_MS);

      const tDone = setTimeout(() => { animDone.current = true; markDone(); }, ANIM_DURATION_MS);

      return () => {
        clearTimeout(t0);
        clearTimeout(tDone);
        if (audioRef.current) {
          audioRef.current.pause();
          if (!passedAudio) audioRef.current.src = "";
        }
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
  if (phase === "done") return <DoneScreen onRestart={handleStart} onDevam={onDevam} />;
  return <AnimasyonSahnesi key={animKey} filmMode={!!filmMode} />;
}

/* ─── Start screen ─── */
function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none" style={BG_STYLE}>
      <MetrixLogo />
      <button
        onClick={onStart}
        className="mt-4 px-8 py-4 rounded-2xl font-bold text-[15px] tracking-wide"
        style={{ color: "#5236F5", background: "rgba(82,54,245,0.08)", border: "1px solid rgba(82,54,245,0.22)" }}
      >
        Sahne 2&apos;yi Başlat
      </button>
    </div>
  );
}

/* ─── Done screen ─── */
function DoneScreen({ onRestart, onDevam }: { onRestart: () => void; onDevam?: () => void }) {
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

/* ─── Main animation scene ─── */
function AnimasyonSahnesi({ filmMode }: { filmMode: boolean }) {
  const [titleOut,      setTitleOut]      = useState(false);
  const [formOut,       setFormOut]       = useState(false);
  const [showChat,      setShowChat]      = useState(false);
  const [showMsg0,      setShowMsg0]      = useState(false);
  const [showMsg1,      setShowMsg1]      = useState(false);
  const [showMsg2,      setShowMsg2]      = useState(false);
  const [showPunchline, setShowPunchline] = useState(false);
  const [showCTA,       setShowCTA]       = useState(false);

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setFormOut(true),       FORM_OUT_MS),
      setTimeout(() => setShowChat(true),      CHAT_IN_MS),
      setTimeout(() => setTitleOut(true),      TITLE_OUT_MS),
      setTimeout(() => setShowMsg0(true),      MSG0_MS),
      setTimeout(() => setShowMsg1(true),      MSG1_MS),
      setTimeout(() => setShowMsg2(true),      MSG2_MS),
      setTimeout(() => setShowPunchline(true), PUNCHLINE_MS),
      setTimeout(() => setShowCTA(true),       CTA_MS),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={BG_STYLE}>

      {/* Title — stays visible while audio narrates; fades after chat is established */}
      <motion.div
        className="absolute inset-x-0 px-6 pt-14"
        initial={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        animate={
          titleOut
            ? { opacity: 0, y: -6, filter: "blur(5px)" }
            : { opacity: 1, y: 0,  filter: "blur(0px)" }
        }
        transition={
          titleOut
            ? { duration: 0.8, ease: "easeIn" }
            : { delay: 0.3, duration: 1.0, ease: "easeOut" }
        }
      >
        <h1
          className="text-center font-black leading-tight tracking-tight"
          style={{ fontSize: "clamp(22px,6vw,28px)", color: "#1a1438" }}
        >
          Oysa bunları yapmak için
          <br />
          menülerde dolaşmana gerek yok.
        </h1>
      </motion.div>

      {/* CRM Form */}
      <CRMFormPanel fragmenting={formOut} formInDelay={FORM_IN_MS / 1000} />

      {/* Real product chat */}
      {showChat && (
        <ChatPanel
          showMsg0={showMsg0}
          showMsg1={showMsg1}
          showMsg2={showMsg2}
          showPunchline={showPunchline}
          showCTA={showCTA}
          filmMode={filmMode}
        />
      )}
    </div>
  );
}

/* ─── CRM Form with fragmentation ─── */

const FORM_ROWS = [
  ["Firma Adı",    "Vergi No",        "Vergi Dairesi", "Ticaret Sicil"],
  ["Adres",        "İlçe",            "İl",            "Posta Kodu"],
  ["Telefon",      "Faks",            "E-posta",       "Web Sitesi"],
  ["Yetkili Adı",  "Yetkili Unvanı",  "Yetkili Tel",   "Yetkili Mail"],
  ["Müşteri Tipi", "Sektör",          "Segment",       "Kanal"],
];

const FRAGMENT_EXIT = [
  { x: -280, y: -20,  rotate: -5,  delay: 0.00 },
  { x: -340, y:  30,  rotate: -8,  delay: 0.05 },
  { x: -260, y:  10,  rotate: -4,  delay: 0.10 },
  { x: -380, y: -10,  rotate: -10, delay: 0.15 },
  { x: -300, y:  40,  rotate: -6,  delay: 0.20 },
];

function CRMFormPanel({ fragmenting, formInDelay }: { fragmenting: boolean; formInDelay: number }) {
  return (
    <motion.div
      className="absolute inset-x-4 overflow-hidden rounded-2xl"
      style={{
        top: 130,
        bottom: 72,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
      }}
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: formInDelay, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "#555" }}>Yeni Müşteri — CRM</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(229,57,75,0.08)", color: "#E5394B" }}>
            20 alan
          </span>
        </div>
      </div>

      <div className="flex flex-col h-full overflow-hidden">
        {FORM_ROWS.map((row, i) => (
          <motion.div
            key={i}
            className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-2"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
            animate={fragmenting ? {
              x: FRAGMENT_EXIT[i].x,
              y: FRAGMENT_EXIT[i].y,
              rotate: FRAGMENT_EXIT[i].rotate,
              opacity: 0,
            } : {}}
            transition={fragmenting ? {
              delay: FRAGMENT_EXIT[i].delay,
              duration: 0.38,
              ease: [0.4, 0, 0.8, 0.3],
            } : {}}
          >
            {row.map((label, j) => (
              <div key={j} className="flex flex-col gap-0.5">
                <span className="text-[8.5px] font-medium" style={{ color: "#bbb" }}>{label}</span>
                <div
                  className="h-6 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)" }}
                />
              </div>
            ))}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Real Metrix product chat panel ─── */

function ChatPanel({
  showMsg0,
  showMsg1,
  showMsg2,
  showPunchline,
  showCTA,
  filmMode,
}: {
  showMsg0: boolean;
  showMsg1: boolean;
  showMsg2: boolean;
  showPunchline: boolean;
  showCTA: boolean;
  filmMode: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
      style={{ top: 108, background: "#eef2f0" }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(148,163,184,0.35)",
          background: "rgba(238,242,240,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <MetrixMascot size="large" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[19px] font-black tracking-normal" style={{ color: "#0f172a" }}>
              AI Genel Müdür
            </span>
            <span
              className="grid place-items-center rounded-full text-[9px] font-black text-white"
              style={{ width: 18, height: 18, background: "#4f46e5" }}
            >
              ✓
            </span>
          </div>
          <p className="text-[12px] font-medium" style={{ color: "#64748b" }}>
            Şirketini izler, değerlendirir ve yönlendirir.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-5 overflow-hidden px-4 pt-6 pb-4">

        {/* Metrix bridge message — connects Page 1's chaos to the demo */}
        {showMsg0 && (
          <motion.article
            className="max-w-[88%]"
            initial={{ opacity: 0, x: -20, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 mb-2">
              <MetrixMascot size="small" />
              <span className="text-[13px] font-black" style={{ color: "#334155" }}>AI Genel Müdür</span>
            </div>
            <div
              className="px-4 py-3 rounded-[26px] rounded-tl-[4px]"
              style={{
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.9)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 24px 70px rgba(15,23,42,0.11)",
              }}
            >
              <p className="text-[14px] font-medium leading-[1.6]" style={{ color: "#334155" }}>
                Yeni müşteri açmak için form doldurmana gerek yok.
                <br />
                Bana söylemen yeterli.
              </p>
            </div>
          </motion.article>
        )}

        {showMsg1 && (
          <motion.article
            className="ml-auto max-w-[82%]"
            initial={{ opacity: 0, x: 20, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[11px] font-black text-right mb-1" style={{ color: "rgba(100,116,139,0.7)" }}>Sen</p>
            <div
              className="px-4 py-3 rounded-[22px] rounded-br-[4px]"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #0f172a 100%)",
                boxShadow: "0 18px 48px rgba(79,70,229,0.18)",
              }}
            >
              <p className="text-[15px] font-medium leading-6 text-white">
                Yeni müşteri aç. Firma adı Idea Yapı.
              </p>
            </div>
          </motion.article>
        )}

        {showMsg2 && (
          <motion.article
            className="max-w-[88%]"
            initial={{ opacity: 0, x: -20, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 mb-2">
              <MetrixMascot size="small" />
              <span className="text-[13px] font-black" style={{ color: "#334155" }}>AI Genel Müdür</span>
            </div>
            <div
              className="px-4 py-3 rounded-[26px] rounded-tl-[4px]"
              style={{
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.9)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 24px 70px rgba(15,23,42,0.11)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="grid place-items-center rounded-full shrink-0"
                  style={{ width: 20, height: 20, background: "#22c55e" }}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[15px] font-semibold leading-6" style={{ color: "#0f172a" }}>
                  Idea Yapı oluşturuldu.
                </p>
              </div>
            </div>
          </motion.article>
        )}

        {showPunchline && (
          <motion.div
            className="flex justify-center pt-2"
            initial={{ opacity: 0, scale: 0.92, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p
              className="font-black text-center tracking-tight"
              style={{ fontSize: "clamp(30px,9vw,38px)", color: "#0f172a" }}
            >
              Sadece söyle.
            </p>
          </motion.div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          borderTop: "1px solid rgba(148,163,184,0.35)",
          background: "rgba(238,242,240,0.90)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          className="flex items-center gap-3 min-h-[56px] rounded-[26px] px-4"
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(148,163,184,0.28)",
            boxShadow: "0 20px 60px rgba(15,23,42,0.10)",
            outline: "1px solid white",
          }}
        >
          <span className="flex-1 text-[15px] font-medium" style={{ color: "#94a3b8" }}>
            Bugün hangi kararı netleştirelim?
          </span>
          <div
            className="grid place-items-center rounded-full text-xl font-black text-white shrink-0"
            style={{
              width: 44,
              height: 44,
              background: showCTA
                ? "linear-gradient(135deg, #5236F5 0%, #7C3AED 100%)"
                : "linear-gradient(135deg, #0f172a 0%, #4f46e5 100%)",
              boxShadow: showCTA
                ? "0 14px 34px rgba(82,54,245,0.32)"
                : "0 14px 34px rgba(79,70,229,0.22)",
              transition: "background 0.6s ease, box-shadow 0.6s ease",
            }}
          >
            →
          </div>
        </div>
      </div>

      {/* CTA — only shown in standalone mode */}
      {showCTA && !filmMode && (
        <motion.div
          className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-3 px-6"
          style={{
            paddingBottom: "max(28px, env(safe-area-inset-bottom))",
            paddingTop: 20,
            background: "linear-gradient(to top, #eef2f0 55%, rgba(238,242,240,0))",
          }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <button
            className="w-full max-w-[320px] py-4 rounded-2xl font-black text-white text-[17px] tracking-tight"
            style={{
              background: "linear-gradient(135deg, #5236F5 0%, #7C3AED 100%)",
              boxShadow: "0 12px 36px rgba(82,54,245,0.28)",
            }}
          >
            Devam
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── MetrixMascot ─── */
function MetrixMascot({ size }: { size: "small" | "large" }) {
  const outer = size === "large" ? { width: 44, height: 44 } : { width: 32, height: 32 };
  const face  = size === "large"
    ? { width: 26, height: 20, dotSize: 6 }
    : { width: 18, height: 14, dotSize: 4 };

  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        ...outer,
        background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 50%, white 100%)",
        boxShadow: "0 10px 28px rgba(99,102,241,0.18)",
      }}
    >
      <div
        className="relative rounded-[40%]"
        style={{
          width: face.width,
          height: face.height,
          background: "#0f172a",
          boxShadow: "inset 0 -4px 8px rgba(99,102,241,0.5)",
        }}
      >
        <span
          className="absolute rounded-full"
          style={{ left: "22%", top: "30%", width: face.dotSize, height: face.dotSize, background: "#a78bfa", boxShadow: "0 0 8px rgba(139,92,246,0.9)" }}
        />
        <span
          className="absolute rounded-full"
          style={{ right: "22%", top: "30%", width: face.dotSize, height: face.dotSize, background: "#67e8f9", boxShadow: "0 0 8px rgba(34,211,238,0.9)" }}
        />
      </div>
    </div>
  );
}

/* ─── Shared logo ─── */
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
