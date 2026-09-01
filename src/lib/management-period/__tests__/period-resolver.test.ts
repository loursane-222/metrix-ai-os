import { describe, expect, it } from "vitest";

import { resolveComparableManagementPeriods, resolveManagementPeriod } from "../period-resolver";

const ISTANBUL = "Europe/Istanbul";

function iso(kind: Parameters<typeof resolveManagementPeriod>[0]["kind"], now: string, timeZone = ISTANBUL, rollingDays?: number) {
  const value = resolveManagementPeriod({ kind, now: new Date(now), timeZone, rollingDays });
  return { start: value.start.toISOString(), end: value.end.toISOString(), label: value.label };
}

describe("management period resolver — explicit timezone-safe [start, end) contract", () => {
  it("resolves current and previous month on 1 September 2026 in Istanbul", () => {
    expect(iso("CURRENT_MONTH", "2026-09-01T09:00:00.000Z")).toEqual({
      start: "2026-08-31T21:00:00.000Z", end: "2026-09-01T09:00:00.000Z", label: "Eylül 2026",
    });
    expect(iso("PREVIOUS_MONTH", "2026-09-01T09:00:00.000Z")).toEqual({
      start: "2026-07-31T21:00:00.000Z", end: "2026-08-31T21:00:00.000Z", label: "Ağustos 2026",
    });
  });

  it.each([
    ["year boundary", "2026-01-10T09:00:00.000Z", "2025-11-30T21:00:00.000Z", "2025-12-31T21:00:00.000Z", "Aralık 2025"],
    ["leap-year February", "2024-03-10T09:00:00.000Z", "2024-01-31T21:00:00.000Z", "2024-02-29T21:00:00.000Z", "Şubat 2024"],
  ])("resolves %s", (_case, now, start, end, label) => {
    expect(iso("PREVIOUS_MONTH", now)).toEqual({ start, end, label });
  });

  it("uses Monday-start weeks and handles a week crossing a month", () => {
    expect(iso("CURRENT_WEEK", "2026-09-02T09:00:00.000Z")).toEqual({
      start: "2026-08-30T21:00:00.000Z", end: "2026-09-02T09:00:00.000Z", label: "2026-08-31 / 2026-09-02",
    });
    expect(iso("PREVIOUS_WEEK", "2026-09-02T09:00:00.000Z")).toEqual({
      start: "2026-08-23T21:00:00.000Z", end: "2026-08-30T21:00:00.000Z", label: "2026-08-24 / 2026-08-30",
    });
  });

  it("resolves current and previous rolling 7 calendar-day windows without overlap", () => {
    const pair = resolveComparableManagementPeriods({ kind: "ROLLING_DAYS", now: new Date("2026-09-01T09:34:56.789Z"), timeZone: ISTANBUL, rollingDays: 7 });
    expect(pair.current.start.toISOString()).toBe("2026-08-25T09:34:56.789Z");
    expect(pair.current.end.toISOString()).toBe("2026-09-01T09:34:56.789Z");
    expect(pair.previous.start.toISOString()).toBe("2026-08-18T09:34:56.789Z");
    expect(pair.previous.end.toISOString()).toBe(pair.current.start.toISOString());
  });

  it("uses the requested local date when UTC is still on the previous date", () => {
    expect(iso("CURRENT_MONTH", "2026-08-31T21:30:00.000Z", "Pacific/Kiritimati")).toMatchObject({
      start: "2026-08-31T10:00:00.000Z", end: "2026-08-31T21:30:00.000Z", label: "Eylül 2026",
    });
  });

  it("requires an explicit positive rolling-day count", () => {
    expect(() => resolveManagementPeriod({ kind: "ROLLING_DAYS", now: new Date(), timeZone: ISTANBUL })).toThrow(/rollingDays/u);
  });
});
