"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BrandFilmPlayer.module.css";

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
    <section className={styles.stage} aria-label="Metrix marka filmi">
      <div className={styles.atmosphere} aria-hidden="true"><i /><i /></div>
      <header className={styles.identity}><span>METRIX</span><i /><small>TANIŞMA FİLMİ</small></header>
      <div className={styles.experience}>
        <div className={styles.filmShell}>
          <div className={styles.videoSurface}>
          <video ref={videoRef} className={styles.video} playsInline poster="/media/brand/metrix-brand-film-poster.png" preload="metadata" onEnded={() => void resolve("WATCHED")} onError={() => { setError("Film yüklenemedi. Metrix’e devam edebilirsiniz."); void resolve("PLAYBACK_ERROR"); }} onPause={() => setPaused(true)} onPlay={() => setPaused(false)}>
            <source src="/media/brand/metrix-brand-film.mp4" type="video/mp4" />
          </video>
          <div className={styles.filmTint} aria-hidden="true" />
          {!started ? <div className={styles.readyCue}><button className={styles.playCue} type="button" aria-label="Filmi başlat" onClick={() => void play()}><span /></button><p>METRIX ile tanışın</p></div> : null}
          {started && !paused && !error ? <div className={styles.playingCue} aria-hidden="true"><span>METRIX</span><i /></div> : null}
          {started && paused && !error ? <div className={styles.pausedCue} aria-hidden="true"><span /><p>Film duraklatıldı</p></div> : null}
          </div>
          <div className={styles.filmMeta}><div><p className={styles.eyebrow}><span />İLK DENEYİM</p><h1>METRIX’e kısa bir giriş</h1></div><p>Çalışma ortamınıza geçmeden önce METRIX’i yakından tanıyın.</p></div>
        </div>
        {error ? <p role="status" aria-live="polite" className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          {!started ? <button className={styles.primary} onClick={() => void play()} type="button"><span className={styles.playIcon} />Filmi Başlat</button> : <button className={styles.primary} onClick={() => paused ? void play() : videoRef.current?.pause()} type="button"><span className={paused ? styles.playIcon : styles.pauseIcon} />{paused ? "Devam Et" : "Duraklat"}</button>}
          <button className={styles.secondary} onClick={() => void resolve("SKIPPED")} type="button">Şimdi Başla <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>
  );
}
