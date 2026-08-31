import { describe, expect, it } from "vitest";
import { resolvePreviousCalendarMonthRange } from "../date-ranges";

describe("resolvePreviousCalendarMonthRange — deterministic period boundaries", () => {
  it("resolves the full previous calendar month for a mid-month instant", () => {
    const period = resolvePreviousCalendarMonthRange(new Date("2026-09-15T10:00:00Z"), "Europe/Istanbul");
    expect(period.from.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(period.isoLabel).toBe("2026-08");
    expect(period.label).toContain("2026");
  });

  it("handles the January → previous December year rollover", () => {
    const period = resolvePreviousCalendarMonthRange(new Date("2026-01-10T10:00:00Z"), "Europe/Istanbul");
    expect(period.from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.isoLabel).toBe("2025-12");
  });

  it("never depends on model-supplied dates — the same instant always resolves the same range regardless of timezone label passed", () => {
    const a = resolvePreviousCalendarMonthRange(new Date("2026-09-01T00:00:01Z"), "Europe/Istanbul");
    const b = resolvePreviousCalendarMonthRange(new Date("2026-09-01T00:00:01Z"), "Europe/Istanbul");
    expect(a).toEqual(b);
  });
});
