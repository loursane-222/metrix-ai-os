"use client";

import { useEffect, useRef } from "react";
import { resolveExecutiveFaceState, type ExecutiveFacePresenceInput, type ExecutiveFaceState } from "./executive-face-state";
import { createFaceParticles, FACE_HALF_HEIGHT_EXTENT, FACE_HALF_WIDTH_EXTENT } from "./executive-face-particles";
import { faceFrame, particleOffset } from "./executive-face-motion";
import styles from "./ExecutiveFacePresence.module.css";

const STATE_LABEL: Record<ExecutiveFaceState, string> = {
  idle: "Hazır",
  listening: "Dinliyor",
  thinking: "Düşünüyor",
  speaking: "Yanıtlıyor",
  working: "Çalışıyor",
  error: "Dikkat gerekiyor",
};

const ACCENT_RGB = "201,191,168";
const ATTENTION_RGB = "184,135,74";
const WHITE_RGB = "237,231,217";
const MAX_PARTICLES = 1400;
const BASE_PARTICLES = createFaceParticles(MAX_PARTICLES);

export function ExecutiveFacePresence(props: ExecutiveFacePresenceInput) {
  const state = resolveExecutiveFaceState(props);
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let activeParticles = BASE_PARTICLES;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = Math.max(0.5, Math.min(1, width / 168));
      activeParticles = BASE_PARTICLES.slice(0, Math.round(BASE_PARTICLES.length * density));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let startedAt = performance.now();

    const draw = (now: number) => {
      const t = (now - startedAt) / 1000;
      const current = stateRef.current;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(
        width / (FACE_HALF_WIDTH_EXTENT * 2 * 1.06),
        height / (FACE_HALF_HEIGHT_EXTENT * 2 * 1.06),
      );
      const frame = faceFrame(current, t);
      const accentRgb = current === "error" ? ATTENTION_RGB : ACCENT_RGB;
      for (const particle of activeParticles) {
        const offset = particleOffset(current, particle, t);
        const x = cx + (particle.x * frame.scale + offset.dx) * scale;
        const y = cy + (particle.y * frame.scale + offset.dy) * scale;
        const alpha = Math.min(1, Math.max(0, particle.alpha * frame.alpha * offset.alpha));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${particle.accent ? accentRgb : WHITE_RGB}, ${alpha.toFixed(3)})`;
        ctx.arc(x, y, particle.radius * (scale / 92), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduceMotion && document.visibilityState === "visible") raf = requestAnimationFrame(draw);
    };

    const stop = () => cancelAnimationFrame(raf);
    const start = () => {
      startedAt = performance.now();
      raf = requestAnimationFrame(draw);
    };

    if (reduceMotion) draw(startedAt);
    else start();

    const onVisibility = () => {
      if (reduceMotion) return;
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <figure
      className="mx-auto flex w-full max-w-[270px] flex-col items-center"
      data-executive-face="canonical"
      data-presence-state={state}
    >
      <canvas
        aria-label={`METRIX Executive Face — ${STATE_LABEL[state]}`}
        className={`${styles.face} h-[168px] w-[min(44vw,168px)] min-w-[118px] max-w-[168px] sm:w-[168px]`}
        ref={canvasRef}
        role="img"
      />
      <figcaption aria-live="polite" className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#7C7466]">
        {STATE_LABEL[state]}
      </figcaption>
    </figure>
  );
}
