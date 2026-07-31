import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { resolveExecutiveFaceState } from "../executive-face-state";

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

  it("renders one head-only particle host and never consumes the raster reference", () => {
    expect(source).toContain('data-executive-face="canonical"');
    expect(source).toContain("createFaceParticles(196)");
    expect(source).not.toMatch(/<img|next\/image|metrix-executive-face-reference/);
    expect(source).not.toMatch(/neck|shoulder|chest|boyun|omuz|göğüs/i);
  });

  it("provides an accessible static reduced-motion fallback", () => {
    expect(source).toContain('role="img"');
    expect(source).toContain("aria-label={`METRIX Executive Face");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation: none !important");
  });
});
