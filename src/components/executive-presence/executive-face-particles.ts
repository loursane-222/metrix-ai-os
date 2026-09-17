export type FaceParticle = Readonly<{
  x: number;
  y: number;
  radius: number;
  alpha: number;
  accent: boolean;
  dissolve: boolean;
}>;

/** Half-extents of the sampled face space; the component uses these to fit the canvas. */
export const FACE_HALF_WIDTH_EXTENT = 0.72;
export const FACE_HALF_HEIGHT_EXTENT = 1.14;

/**
 * Rejection-samples particles against an elliptical head/face density field
 * (dense center, soft falloff edge, tapered jaw and crown) instead of a
 * uniform-rectangular scatter clipped by a hard outline path.
 */
export function createFaceParticles(count: number, seedValue = 84172): FaceParticle[] {
  let seed = seedValue;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const particles: FaceParticle[] = [];
  let attempts = 0;
  const maxAttempts = count * 80;
  while (particles.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = (random() * 2 - 1) * FACE_HALF_WIDTH_EXTENT;
    const y = (random() * 2 - 1) * FACE_HALF_HEIGHT_EXTENT;
    const density = faceDensity(x, y);
    if (density <= 0 || random() > density) continue;
    particles.push({
      x,
      y,
      radius: 0.42 + random() * 0.62 * (0.55 + density * 0.45),
      alpha: 0.3 + random() * 0.7 * density,
      accent: random() > 0.7,
      dissolve: random() < (x > 0 ? 0.42 : 0.12),
    });
  }
  return particles;
}

/**
 * 0 outside the face volume, 1 at the core, soft falloff toward the edge.
 * An egg-shaped oval: full width through the temples/cheeks, tapering to a
 * narrower chin below and a gently rounded crown above.
 */
export function faceDensity(x: number, y: number): number {
  const jawTaper = y > 0.35 ? 1 - 0.34 * smoothstep(0.35, 1.05, y) : 1;
  const crownTaper = y < -0.75 ? 1 - 0.18 * smoothstep(-0.75, -1.1, y) : 1;
  const halfWidth = 0.62 * jawTaper * crownTaper;
  if (halfWidth <= 0) return 0;
  const nx = x / halfWidth;
  const ny = y / 0.94;
  const r = Math.sqrt(nx * nx + ny * ny);
  if (r >= 1.08) return 0;
  if (r <= 0.68) return 1;
  return 1 - smoothstep(0.68, 1.08, r);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
