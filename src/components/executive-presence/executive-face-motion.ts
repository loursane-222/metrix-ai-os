import type { ExecutiveFaceState } from "./executive-face-state";
import { clamp01, type FaceParticle } from "./executive-face-particles";

export type FaceFrame = Readonly<{ scale: number; alpha: number }>;
export type ParticleOffset = Readonly<{ dx: number; dy: number; alpha: number }>;

/** Whole-face breathing/pulse envelope per canonical presence state. */
export function faceFrame(state: ExecutiveFaceState, t: number): FaceFrame {
  switch (state) {
    case "listening":
      return { scale: 1 - 0.012 * Math.sin(t * (Math.PI * 2) / 1.7), alpha: 0.9 + 0.1 * Math.sin(t * (Math.PI * 2) / 1.7) };
    case "thinking":
      return { scale: 1 + 0.01 * Math.sin(t * (Math.PI * 2) / 1.2), alpha: 0.92 };
    case "speaking":
      return { scale: 1 + 0.014 * Math.sin(t * (Math.PI * 2) / 0.78), alpha: 0.94 + 0.06 * Math.sin(t * (Math.PI * 2) / 0.78) };
    case "working":
      return { scale: 1, alpha: 0.92 };
    case "error":
      return { scale: 1 - 0.006 * Math.sin(t * (Math.PI * 2) / 2.4), alpha: 0.92 };
    default:
      return { scale: 1 + 0.01 * Math.sin(t * (Math.PI * 2) / 5.5), alpha: 0.86 + 0.14 * Math.sin(t * (Math.PI * 2) / 5.5) };
  }
}

/** Per-particle displacement/alpha modulation layered on top of the whole-face frame. */
export function particleOffset(state: ExecutiveFaceState, particle: FaceParticle, t: number): ParticleOffset {
  if (state === "listening") {
    const pull = 0.03 * Math.sin(t * (Math.PI * 2) / 1.7);
    return { dx: -particle.x * pull, dy: -particle.y * pull, alpha: 1 };
  }
  if (state === "thinking" && particle.dissolve) {
    const phase = t * (Math.PI * 2) / 1.35 + particle.x * 2;
    const drift = 0.05 + 0.03 * Math.sin(phase);
    return { dx: drift, dy: 0.01 * Math.sin(phase * 1.3), alpha: clamp01(0.55 + 0.45 * Math.sin(phase)) };
  }
  if (state === "speaking") {
    const phase = t * (Math.PI * 2) / 0.78 + (particle.y + 1.2) * 1.5;
    return { dx: 0, dy: 0.012 * Math.sin(phase), alpha: clamp01(0.85 + 0.15 * Math.sin(phase)) };
  }
  if (state === "working") {
    const phase = t * (Math.PI * 2) / 1.45;
    return { dx: 0.018 * Math.sin(phase) + 0.01, dy: 0, alpha: 1 };
  }
  return { dx: 0, dy: 0, alpha: 1 };
}
