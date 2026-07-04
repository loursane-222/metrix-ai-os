"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const AUDIO_SRC = "/audio/metrix-reklam-sayfa-3.mp3";
const ANIM_DURATION_MS = 13000;

const AUDIO_START_MS = 1400;
const MSG1_MS        = 2200;
const MSG2_MS        = 4800;
const QUOTE_RISE_MS  = 5600;
const QUOTE_FULL_MS  = 7000;
const ACTIONS_MS     = 9400;

const BG_STYLE: React.CSSProperties = {
  background: "linear-gradient(160deg, #f9f8f5 0%, #f4f3ef 40%, #f1f0f8 100%)",
};

const Q = {
  no:         "TKL-2026-0015",
  date:       "20.06.2026",
  validUntil: "20.07.2026",
  customer:   "Idea Yapı A.Ş.",
  item:       "Zemin Kaplama İşleri",
  qty:        200,
  unitPrice:  2400,
  get subtotal() { return this.qty * this.unitPrice; },
  get kdv()      { return this.subtotal * 0.2; },
  get total()    { return this.subtotal + this.kdv; },
};

function fmt(n: number) {
  return "₺" + n.toLocaleString("tr-TR");
}

type Phase = "idle" | "playing" | "done";

type Props = {
  onDevam?: () => void;
  autoStart?: boolean;
  filmMode?: boolean;
  audio?: HTMLAudioElement;
  onComplete?: () => void;
};

export function SayfaUc({ onDevam, autoStart, filmMode, audio: passedAudio, onComplete }: Props = {}) {
  const [phase, setPhase]     = useState<Phase>(filmMode ? "playing" : "idle");
  const [animKey, setAnimKey] = useState(0);
  const timers      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const animDone    = useRef(false);
  const audioDone   = useRef(false);
  const didAutoStart = useRef(false);
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

  // ── Standalone start (button click or autoStart) ──────────────────────────
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

    // Standalone autoStart
    if (autoStart && !didAutoStart.current) {
      didAutoStart.current = true;
      handleStart();
    }

    return () => {
      timers.current.forEach(clearTimeout);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") return <StartScreen onStart={handleStart} />;
  if (phase === "done") return <DoneScreen onRestart={handleStart} onDevam={onDevam} />;
  return <AnimasyonSahnesi key={animKey} />;
}

/* ─── Start ─── */
function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 select-none" style={BG_STYLE}>
      <MetrixLogo />
      <button
        onClick={onStart}
        className="mt-4 px-8 py-4 rounded-2xl font-bold text-[15px] tracking-wide"
        style={{ color: "#5236F5", background: "rgba(82,54,245,0.08)", border: "1px solid rgba(82,54,245,0.22)" }}
      >
        Sahne 3&apos;ü Başlat
      </button>
    </div>
  );
}

/* ─── Done ─── */
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

/* ─── Main scene ─── */
function AnimasyonSahnesi() {
  const [showMsg1,    setShowMsg1]    = useState(false);
  const [showMsg2,    setShowMsg2]    = useState(false);
  const [showQuote,   setShowQuote]   = useState(false);
  const [quoteReady,  setQuoteReady]  = useState(false);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    const ts = [
      setTimeout(() => setShowMsg1(true),    MSG1_MS),
      setTimeout(() => setShowMsg2(true),    MSG2_MS),
      setTimeout(() => setShowQuote(true),   QUOTE_RISE_MS),
      setTimeout(() => setQuoteReady(true),  QUOTE_FULL_MS),
      setTimeout(() => setShowActions(true), ACTIONS_MS),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={BG_STYLE}>

      {/* Title */}
      <motion.div
        className="absolute inset-x-0 px-6 pt-14"
        initial={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.3, duration: 1.0, ease: "easeOut" }}
      >
        <h1
          className="text-center font-black leading-tight tracking-tight"
          style={{ fontSize: "clamp(22px,6vw,28px)", color: "#1a1438" }}
        >
          Teklif hazırlamak
          <br />
          için de.
        </h1>
      </motion.div>

      <ChatPanel3 showMsg1={showMsg1} showMsg2={showMsg2} showQuote={showQuote} />

      {showQuote && <QuoteDocument quoteReady={quoteReady} showActions={showActions} />}
    </div>
  );
}

/* ─── Chat ─── */
function ChatPanel3({
  showMsg1,
  showMsg2,
  showQuote,
}: {
  showMsg1: boolean;
  showMsg2: boolean;
  showQuote: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
      style={{ top: 108, background: "#eef2f0" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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
              <p className="text-[15px] font-medium leading-[1.55] text-white">
                Idea Yapı için teklif hazırla.{" "}
                200 metrekare. Birim fiyat 2400 TL.
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
              {showQuote ? (
                <div className="flex items-center gap-2.5">
                  <div
                    className="grid place-items-center rounded-full shrink-0"
                    style={{ width: 20, height: 20, background: "#22c55e" }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-semibold" style={{ color: "#0f172a" }}>
                    Teklif hazır — {Q.no}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <LoadingDots />
                  <p className="text-[14px] font-medium" style={{ color: "#64748b" }}>
                    Teklif hazırlanıyor...
                  </p>
                </div>
              )}
            </div>
          </motion.article>
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
              width: 44, height: 44,
              background: "linear-gradient(135deg, #0f172a 0%, #4f46e5 100%)",
              boxShadow: "0 14px 34px rgba(79,70,229,0.22)",
            }}
          >
            →
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Quote Document ─── */
function QuoteDocument({
  quoteReady,
  showActions,
}: {
  quoteReady: boolean;
  showActions: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
      style={{
        top: 148,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        boxShadow: "0 -12px 70px rgba(0,0,0,0.16), 0 -1px 0 rgba(0,0,0,0.06)",
        background: "#ffffff",
      }}
      initial={{ y: 800 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 32, mass: 1 }}
    >
      {/* Brand top stripe */}
      <div style={{ height: 4, background: "linear-gradient(90deg, #5236F5 0%, #7C3AED 60%, #06b6d4 100%)", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} />

      {/* Drag handle */}
      <div className="flex justify-center pt-2.5 pb-0 shrink-0">
        <div className="w-8 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.09)" }} />
      </div>

      {/* Document content */}
      <motion.div
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: quoteReady ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Letterhead */}
        <div className="px-5 pt-3 pb-3" style={{ borderBottom: "1.5px solid #f0eeeb" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="grid place-items-center rounded-lg shrink-0" style={{ width: 26, height: 26, background: "rgba(82,54,245,0.1)" }}>
                  <svg width="14" height="14" viewBox="0 0 48 48" fill="none">
                    <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="24" cy="13" r="3.5" fill="#5236F5" />
                  </svg>
                </div>
                <span className="font-black tracking-wide text-[13px]" style={{ color: "#5236F5" }}>METRIX</span>
              </div>
              <p className="text-[10px]" style={{ color: "#94a3b8" }}>info@metrix.ai</p>
            </div>
            <div className="text-right">
              <span className="inline-flex px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest" style={{ background: "rgba(82,54,245,0.08)", color: "#5236F5", letterSpacing: "0.14em" }}>
                TEKLİF
              </span>
              <p className="text-[12px] font-black mt-1" style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{Q.no}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#94a3b8" }}>{Q.date}</p>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="px-5 py-2.5 flex gap-4" style={{ background: "#fafaf8", borderBottom: "1.5px solid #f0eeeb" }}>
          <MetaCell label="Geçerlilik" value={Q.validUntil} />
          <div style={{ width: 1, background: "#ece9e4", alignSelf: "stretch" }} />
          <MetaCell label="Ödeme Koşulları" value="30 gün vadeli" />
          <div style={{ width: 1, background: "#ece9e4", alignSelf: "stretch" }} />
          <MetaCell label="Teslim Süresi" value="15 iş günü" />
        </div>

        {/* Müşteri */}
        <div className="px-5 py-3" style={{ borderBottom: "1.5px solid #f0eeeb" }}>
          <FieldLabel>Müşteri</FieldLabel>
          <p className="text-[15px] font-bold mt-0.5" style={{ color: "#0f172a" }}>{Q.customer}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>İstanbul, Türkiye</p>
        </div>

        {/* Kalemler */}
        <div className="px-5 py-3" style={{ borderBottom: "1.5px solid #f0eeeb" }}>
          <FieldLabel>Kalemler</FieldLabel>
          <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid #ede9e3" }}>
            <div className="grid px-3 py-1.5" style={{ gridTemplateColumns: "1fr auto auto", gap: "8px", background: "#f7f5f0", borderBottom: "1px solid #ede9e3" }}>
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: "#94a3b8" }}>Açıklama</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-right" style={{ color: "#94a3b8" }}>Miktar</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-right" style={{ color: "#94a3b8" }}>Tutar</span>
            </div>
            <div className="grid px-3 py-2.5" style={{ gridTemplateColumns: "1fr auto auto", gap: "8px" }}>
              <div>
                <p className="text-[13px] font-semibold leading-tight" style={{ color: "#0f172a" }}>{Q.item}</p>
                <p className="text-[10px] mt-0.5 font-mono" style={{ color: "#94a3b8" }}>{Q.qty} m² × {fmt(Q.unitPrice)}</p>
              </div>
              <p className="text-[12px] font-mono text-right self-center" style={{ color: "#475569" }}>{Q.qty} m²</p>
              <p className="text-[13px] font-black font-mono text-right self-center" style={{ color: "#0f172a" }}>{fmt(Q.subtotal)}</p>
            </div>
          </div>
        </div>

        {/* Açıklamalar */}
        <div className="px-5 py-3" style={{ borderBottom: "1.5px solid #f0eeeb" }}>
          <FieldLabel>Açıklamalar</FieldLabel>
          <p className="text-[12px] leading-[1.65] mt-1.5" style={{ color: "#475569" }}>
            Bu teklif, belirtilen metrekare ve birim fiyat üzerinden hazırlanmıştır.
            Malzeme temin süresi ve saha koşullarına göre teslim tarihi güncellenebilir.
            KDV hariç fiyatlar yukarıda gösterilmektedir.
          </p>
        </div>

        {/* Totals */}
        <div className="px-5 pt-3 pb-3">
          <div className="space-y-1.5">
            <TotalRow label="Ara Toplam" value={fmt(Q.subtotal)} />
            <TotalRow label="KDV (%20)"  value={fmt(Q.kdv)} />
          </div>
          <div className="flex justify-between items-center mt-2.5 pt-2.5" style={{ borderTop: "2px solid #0f172a" }}>
            <span className="text-[15px] font-black" style={{ color: "#0f172a" }}>Genel Toplam</span>
            <span className="text-[20px] font-black font-mono" style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
              {fmt(Q.total)}
            </span>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#94a3b8" }}>Geçerlilik tarihi: {Q.validUntil}</p>
        </div>
      </motion.div>

      {/* Action strip */}
      <div
        className="shrink-0 px-4 pt-2.5"
        style={{
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          borderTop: "1px solid #f0eeeb",
          background: "white",
        }}
      >
        {showActions ? (
          <motion.div
            className="flex gap-2"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white text-[14px]"
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                boxShadow: "0 10px 28px rgba(34,197,94,0.32)",
              }}
            >
              <WhatsAppIcon />
              <span>WhatsApp ile Gönder</span>
            </button>
            <button
              className="py-3.5 px-3.5 rounded-2xl font-bold text-[13px] shrink-0"
              style={{ background: "white", border: "1.5px solid rgba(82,54,245,0.22)", color: "#5236F5", boxShadow: "0 4px 14px rgba(0,0,0,0.06)" }}
            >
              Soru Sor
            </button>
            <button
              className="py-3.5 px-3.5 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "white", border: "1.5px solid rgba(0,0,0,0.10)", color: "#475569", boxShadow: "0 4px 14px rgba(0,0,0,0.06)" }}
            >
              <QRIcon />
            </button>
          </motion.div>
        ) : (
          <div className="h-[52px]" />
        )}
      </div>
    </motion.div>
  );
}

/* ─── Small helpers ─── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#bbb", letterSpacing: "0.12em" }}>
      {children}
    </p>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[8px] font-bold uppercase tracking-wider truncate" style={{ color: "#bbb" }}>{label}</p>
      <p className="text-[11px] font-bold mt-0.5 truncate" style={{ color: "#334155" }}>{value}</p>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[12px]" style={{ color: "#94a3b8" }}>{label}</span>
      <span className="text-[13px] font-semibold font-mono" style={{ color: "#475569", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/* ─── Shared sub-components ─── */

function MetrixLogo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="flex items-center justify-center rounded-[28px]"
        style={{ width: 88, height: 88, background: "white", boxShadow: "0 8px 32px rgba(82,54,245,0.16), 0 2px 8px rgba(0,0,0,0.06)" }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="6" width="36" height="36" rx="10" fill="#5236F5" opacity="0.10" />
          <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="14" r="4" fill="#5236F5" />
        </svg>
      </div>
      <span className="font-black tracking-[0.22em] uppercase" style={{ fontSize: 15, color: "#5236F5" }}>
        METRIX
      </span>
    </div>
  );
}

function MetrixMascot({ size }: { size: "small" | "large" }) {
  const outer = size === "large" ? { width: 44, height: 44 } : { width: 32, height: 32 };
  const face  = size === "large"
    ? { width: 26, height: 20, dot: 6 }
    : { width: 18, height: 14, dot: 4 };
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{ ...outer, background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 50%, white 100%)", boxShadow: "0 10px 28px rgba(99,102,241,0.18)" }}
    >
      <div
        className="relative rounded-[40%]"
        style={{ width: face.width, height: face.height, background: "#0f172a", boxShadow: "inset 0 -4px 8px rgba(99,102,241,0.5)" }}
      >
        <span className="absolute rounded-full" style={{ left: "22%", top: "30%", width: face.dot, height: face.dot, background: "#a78bfa", boxShadow: "0 0 8px rgba(139,92,246,0.9)" }} />
        <span className="absolute rounded-full" style={{ right: "22%", top: "30%", width: face.dot, height: face.dot, background: "#67e8f9", boxShadow: "0 0 8px rgba(34,211,238,0.9)" }} />
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1 items-center shrink-0">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{ width: 5, height: 5, background: "#94a3b8" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.112 1.523 5.84L.057 23.5l5.834-1.528A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.659-.523-5.168-1.43l-.37-.22-3.463.907.923-3.374-.24-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
    </svg>
  );
}

function QRIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3"  y="3"  width="7" height="7" rx="1" />
      <rect x="14" y="3"  width="7" height="7" rx="1" />
      <rect x="3"  y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="19" y="14" width="2" height="2" />
      <rect x="14" y="19" width="2" height="2" />
      <rect x="18" y="18" width="3" height="3" />
    </svg>
  );
}
