import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { resolveExecutiveFaceState } from "../executive-face-state";
import { createFaceParticles, faceDensity } from "../executive-face-particles";

const source = readFileSync(
  fileURLToPath(new URL("../ExecutiveFacePresence.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../ExecutiveFacePresence.module.css", import.meta.url)),
  "utf8",
);

describe("Executive Face canonical presence projection", () => {
  it("maps existing behavior and voice authorities without local state", () => {
    expect(resolveExecutiveFaceState({ behaviorStatus: "idle", voicePresence: "idle" })).toBe("idle");
    expect(resolveExecutiveFaceState({ behaviorStatus: "idle", voicePresence: "listening" })).toBe("listening");
    expect(resolveExecutiveFaceState({ behaviorStatus: "thinking", voicePresence: "idle" })).toBe("thinking");
    expect(resolveExecutiveFaceState({ behaviorStatus: "idle", voicePresence: "speaking" })).toBe("speaking");
    expect(resolveExecutiveFaceState({ behaviorStatus: "applying", voicePresence: "idle" })).toBe("working");
    expect(resolveExecutiveFaceState({ behaviorStatus: "error", voicePresence: "speaking" })).toBe("error");
    expect(source).not.toMatch(/useState|createContext|useReducer/);
  });

  it("renders one head-only particle host on canvas and never consumes the raster reference", () => {
    expect(source).toContain('data-executive-face="canonical"');
    expect(source).toContain("<canvas");
    expect(source).not.toMatch(/<img|next\/image|metrix-executive-face-reference/);
    expect(source).not.toMatch(/neck|shoulder|chest|boyun|omuz|göğüs/i);
  });

  it("draws no visible outline/contour stroke around the face silhouette", () => {
    expect(source).not.toMatch(/stroke(?:Style|Width)?\s*[:=]/i);
    expect(source).not.toContain("<path");
    expect(source).not.toContain("clipPath");
  });

  it("pauses animation when the tab is hidden and respects reduced motion", () => {
    expect(source).toContain("visibilitychange");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("cancelAnimationFrame");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("provides an accessible label on the render host", () => {
    expect(source).toContain('role="img"');
    expect(source).toContain("aria-label={`METRIX Executive Face");
  });

  it("scales particle density instead of using a fixed arbitrary count", () => {
    expect(source).toContain("MAX_PARTICLES");
    expect(source).toMatch(/BASE_PARTICLES\.slice\(0, Math\.round\(BASE_PARTICLES\.length \* density\)\)/);
    expect(source).not.toMatch(/createFaceParticles\(196\)/);
  });
});

describe("Executive Face particle density field", () => {
  const particles = createFaceParticles(1400);

  it("generates the requested particle count", () => {
    expect(particles).toHaveLength(1400);
  });

  it("keeps every particle inside the face density volume, not a rectangular scatter", () => {
    for (const particle of particles) {
      expect(faceDensity(particle.x, particle.y)).toBeGreaterThan(0);
    }
  });

  it("produces a soft organic density gradient rather than a hard-edged mask", () => {
    expect(faceDensity(0, 0)).toBe(1);
    const edge = faceDensity(0, 1.0);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(faceDensity(0, 5)).toBe(0);
  });

  it("tapers the jaw and crown so the volume reads as a head, not a uniform ellipse", () => {
    expect(faceDensity(0.8, 0.9)).toBeLessThanOrEqual(faceDensity(0.8, -0.1));
  });

  it("keeps at least 70% of particles undisturbed during the thinking dissolve", () => {
    const dissolving = particles.filter((particle) => particle.dissolve).length;
    expect(dissolving / particles.length).toBeLessThan(0.3);
  });

  it("keeps radius and alpha within a sane visible range", () => {
    for (const particle of particles) {
      expect(particle.radius).toBeGreaterThan(0);
      expect(particle.radius).toBeLessThan(2);
      expect(particle.alpha).toBeGreaterThan(0);
      expect(particle.alpha).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(createFaceParticles(200)).toEqual(createFaceParticles(200));
  });
});
