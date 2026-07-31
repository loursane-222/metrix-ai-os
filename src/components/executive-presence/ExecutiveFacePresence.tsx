"use client";

import { resolveExecutiveFaceState, type ExecutiveFacePresenceInput, type ExecutiveFaceState } from "./executive-face-state";
import styles from "./ExecutiveFacePresence.module.css";

const STATE_LABEL: Record<ExecutiveFaceState, string> = {
  idle: "Hazır",
  listening: "Dinliyor",
  thinking: "Düşünüyor",
  speaking: "Yanıtlıyor",
  working: "Çalışıyor",
  error: "Dikkat gerekiyor",
};

const PARTICLES = createFaceParticles(196);

export function ExecutiveFacePresence(props: ExecutiveFacePresenceInput) {
  const state = resolveExecutiveFaceState(props);
  return (
    <figure className="mx-auto flex w-full max-w-[270px] flex-col items-center" data-executive-face="canonical" data-presence-state={state}>
      <svg
        aria-label={`METRIX Executive Face — ${STATE_LABEL[state]}`}
        className={`${styles.face} h-auto w-[min(44vw,168px)] min-w-[118px] max-w-[168px] sm:w-[168px]`}
        data-state={state}
        role="img"
        viewBox="0 0 120 148"
      >
        <defs>
          <clipPath id="metrix-face-clip">
            <path d="M72 7C48 4 29 17 22 38c-5 16-3 35 4 48 3 6 3 13 1 20-2 8 2 18 11 24 9 7 22 10 34 5 13-5 23-17 25-31 1-8-1-14 4-20 6-7 8-15 6-20-1-4-5-6-10-7 4-13 3-28-4-38C88 12 81 8 72 7Z" />
          </clipPath>
        </defs>
        <g className={styles.particles} clipPath="url(#metrix-face-clip)">
          {PARTICLES.map((particle) => (
            <circle
              cx={particle.x}
              cy={particle.y}
              fill={particle.accent ? "var(--face-accent)" : "#f7f9ff"}
              key={particle.id}
              opacity={particle.opacity}
              r={particle.radius}
            />
          ))}
        </g>
        <path d="M72 7C48 4 29 17 22 38c-5 16-3 35 4 48 3 6 3 13 1 20-2 8 2 18 11 24 9 7 22 10 34 5 13-5 23-17 25-31 1-8-1-14 4-20 6-7 8-15 6-20-1-4-5-6-10-7 4-13 3-28-4-38C88 12 81 8 72 7Z" fill="none" opacity=".42" stroke="var(--face-accent)" strokeWidth=".7" />
      </svg>
      <figcaption aria-live="polite" className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#7b8b94]">
        {STATE_LABEL[state]}
      </figcaption>
    </figure>
  );
}

function createFaceParticles(count: number) {
  let seed = 73021;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, index) => ({
    accent: random() > .72,
    id: index,
    opacity: Number((.42 + random() * .58).toFixed(2)),
    radius: Number((.42 + random() * .72).toFixed(2)),
    x: Number((15 + random() * 94).toFixed(2)),
    y: Number((5 + random() * 136).toFixed(2)),
  }));
}
