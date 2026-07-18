import { describe, expect, it } from "vitest";

import {
  clampOrbPosition,
  exceedsDragThreshold,
  getDefaultOrbPosition,
  parseStoredOrbPosition,
} from "../executive-orb-position";

const bounds = {
  viewportWidth: 400,
  viewportHeight: 800,
  orbWidth: 64,
  orbHeight: 64,
  horizontalInset: 16,
  topInset: 20,
  bottomInset: 104,
};

describe("Executive Presence orb geometry", () => {
  it("clamps negative, right, and bottom overflow while preserving valid positions", () => {
    expect(clampOrbPosition({ x: -10, y: -20 }, bounds)).toEqual({ x: 16, y: 20 });
    expect(clampOrbPosition({ x: 999, y: 999 }, bounds)).toEqual({ x: 320, y: 632 });
    expect(clampOrbPosition({ x: 120, y: 240 }, bounds)).toEqual({ x: 120, y: 240 });
  });

  it("returns a deterministic safe origin when the viewport is smaller than the orb", () => {
    expect(
      clampOrbPosition(
        { x: 200, y: 200 },
        { ...bounds, viewportWidth: 40, viewportHeight: 50 },
      ),
    ).toEqual({ x: 16, y: 20 });
  });

  it("computes mobile and desktop right-bottom defaults from dimensions and insets", () => {
    expect(getDefaultOrbPosition(bounds, 16)).toEqual({ x: 320, y: 632 });
    expect(
      getDefaultOrbPosition(
        { ...bounds, viewportWidth: 1200, bottomInset: 32 },
        32,
      ),
    ).toEqual({ x: 1104, y: 704 });
  });

  it("uses an inclusive Euclidean drag threshold", () => {
    expect(exceedsDragThreshold(3, 4)).toBe(false);
    expect(exceedsDragThreshold(6, 6)).toBe(true);
    expect(exceedsDragThreshold(8, 0)).toBe(true);
  });
});

describe("Executive Presence orb persistence payload", () => {
  it("accepts only finite numeric v1 coordinates", () => {
    expect(parseStoredOrbPosition('{"version":1,"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
    expect(parseStoredOrbPosition('{"version":2,"x":12,"y":34}')).toBeNull();
    expect(parseStoredOrbPosition('{"version":1,"x":"12","y":34}')).toBeNull();
    expect(parseStoredOrbPosition('{"version":1,"x":12}')).toBeNull();
    expect(parseStoredOrbPosition('{"version":1,"x":1e999,"y":34}')).toBeNull();
  });

  it("safely ignores missing and invalid JSON", () => {
    expect(parseStoredOrbPosition(null)).toBeNull();
    expect(parseStoredOrbPosition("not-json")).toBeNull();
  });
});
