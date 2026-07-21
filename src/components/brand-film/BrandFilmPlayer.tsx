"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE_BACKGROUND } from "@/components/customers/ui";

export function BrandFilmPlayer({ manual = false, onContinue }: { manual?: boolean; onContinue: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setPaused(true);
  }, []);

  async function resolve(outcome: "WATCHED" | "SKIPPED" | "PLAYBACK_ERROR") {
    if (!manual) {
      try { await fetch("/api/brand-film", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) }); } catch { /* never gate entry */ }
    }
    onContinue();
  }

  async function play() {
    setError(null);
    setStarted(true);
    try { await videoRef.current?.play(); setPaused(false); } catch { setError("Film başlatılamadı. Doğrudan Metrix’e devam edebilirsiniz."); }
  }

  return (
    <section className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center overflow-hidden px-4 text-[#f4f7f8] [color-scheme:dark]" style={{ background: PAGE_BACKGROUND }} aria-label="Metrix marka filmi">
      <div className="relative flex h-full max-h-[900px] w-full max-w-6xl flex-col items-center justify-center">
        <div className="relative aspect-video w-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_30px_100px_rgba(0,0,0,.65)]">
          <video ref={videoRef} className="h-full w-full object-contain" playsInline poster="/media/brand/metrix-brand-film-poster.png" preload="metadata" onEnded={() => void resolve("WATCHED")} onError={() => { setError("Film yüklenemedi. Metrix’e devam edebilirsiniz."); void resolve("PLAYBACK_ERROR"); }} onPause={() => setPaused(true)} onPlay={() => setPaused(false)}>
            <source src="/media/brand/metrix-brand-film.mp4" type="video/mp4" />
          </video>
          {!started ? <div className="absolute inset-0 grid place-items-center bg-black/35"><div className="text-center [text-shadow:0_3px_24px_black]"><p className="text-[clamp(42px,9vw,92px)] font-black tracking-[.16em]">METRIX</p><p className="mt-3 text-xs font-bold tracking-[.28em] text-[#34e6cf]">AI EXECUTIVE OS</p></div></div> : null}
        </div>
        {error ? <p aria-live="polite" className="mt-4 text-sm text-red-200">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!started ? <button className="rounded-xl bg-[#34e6cf] px-6 py-3 text-sm font-bold text-[#062421] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#34e6cf]/30" onClick={() => void play()} type="button">Filmi Başlat</button> : <button className="rounded-xl border border-white/15 bg-white/[.06] px-5 py-3 text-sm font-semibold" onClick={() => paused ? void play() : videoRef.current?.pause()} type="button">{paused ? "Devam Et" : "Duraklat"}</button>}
          <button className="rounded-xl border border-white/15 bg-white/[.04] px-6 py-3 text-sm font-semibold" onClick={() => void resolve("SKIPPED")} type="button">Şimdi Başla</button>
        </div>
      </div>
    </section>
  );
}
