import { describe, expect, it } from "vitest";
import { addDaysToDateString, classifyFinancialDueStatus, dateStringInTimeZone } from "../calendar-timezone";

describe("dateStringInTimeZone", () => {
  it("crosses the Europe/Istanbul (UTC+3) midnight boundary correctly, not the UTC day", () => {
    // 23:30 local (still June 14) — one minute before local midnight.
    expect(dateStringInTimeZone(new Date("2026-06-14T20:29:00.000Z"), "Europe/Istanbul")).toBe("2026-06-14");
    // 00:30 local (now June 15) — one minute after local midnight, while UTC is still June 14.
    expect(dateStringInTimeZone(new Date("2026-06-14T21:30:00.000Z"), "Europe/Istanbul")).toBe("2026-06-15");
  });

  it("disagrees with the naive UTC-day read exactly where it should", () => {
    const instant = new Date("2026-06-14T21:30:00.000Z");
    const naiveUtcDay = instant.toISOString().slice(0, 10);
    expect(naiveUtcDay).toBe("2026-06-14"); // what a UTC-naive implementation would (wrongly) say
    expect(dateStringInTimeZone(instant, "Europe/Istanbul")).toBe("2026-06-15"); // the correct local day
  });

  it("is correct for a negative-offset timezone too (not hardcoded to +3)", () => {
    // 19:30 UTC = 15:30 local in America/New_York (UTC-4 in June, EDT).
    expect(dateStringInTimeZone(new Date("2026-06-14T19:30:00.000Z"), "America/New_York")).toBe("2026-06-14");
    // 03:30 UTC = 23:30 the PREVIOUS local day in America/New_York.
    expect(dateStringInTimeZone(new Date("2026-06-15T03:30:00.000Z"), "America/New_York")).toBe("2026-06-14");
  });

  it("stays correct across a US DST transition (spring-forward, 2026-03-08)", () => {
    // 06:30 UTC on 2026-03-09 = 01:30 EST the day before DST starts.
    expect(dateStringInTimeZone(new Date("2026-03-09T06:30:00.000Z"), "America/New_York")).toBe("2026-03-09");
    // Confirms the Intl-based conversion (not a fixed-offset one) tracks the
    // real local calendar day through the transition instead of drifting.
  });

  it("defaults to Europe/Istanbul when no timeZone is given", () => {
    expect(dateStringInTimeZone(new Date("2026-06-14T21:30:00.000Z"))).toBe("2026-06-15");
  });
});

describe("addDaysToDateString", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysToDateString("2026-01-30", 3)).toBe("2026-02-02");
  });
  it("adds days across a year boundary", () => {
    expect(addDaysToDateString("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("is a no-op for zero days", () => {
    expect(addDaysToDateString("2026-06-14", 0)).toBe("2026-06-14");
  });
});

describe("classifyFinancialDueStatus", () => {
  const timeZone = "Europe/Istanbul";
  // "now" = 2026-06-15T08:00:00Z = 11:00 local June 15.
  const now = new Date("2026-06-15T08:00:00.000Z");

  it("classifies a due date in the past as OVERDUE", () => {
    expect(classifyFinancialDueStatus(new Date("2026-06-14T00:00:00.000Z"), now, timeZone)).toBe("OVERDUE");
  });

  it("classifies today's due date as DUE_TODAY even late in the local day", () => {
    expect(classifyFinancialDueStatus(new Date("2026-06-15T20:00:00.000Z"), now, timeZone)).toBe("DUE_TODAY");
  });

  it("classifies tomorrow (within the default 3-day window) as UPCOMING", () => {
    expect(classifyFinancialDueStatus(new Date("2026-06-16T00:00:00.000Z"), now, timeZone)).toBe("UPCOMING");
  });

  it("classifies the last day of the default 3-day window as UPCOMING and the day after as FUTURE", () => {
    // today (local) = 2026-06-15; window = +3 days = 2026-06-18 inclusive.
    expect(classifyFinancialDueStatus(new Date("2026-06-18T00:00:00.000Z"), now, timeZone)).toBe("UPCOMING");
    expect(classifyFinancialDueStatus(new Date("2026-06-19T03:00:00.000Z"), now, timeZone)).toBe("FUTURE");
  });

  it("respects a custom upcomingWindowDays", () => {
    const dueTomorrow = new Date("2026-06-16T00:00:00.000Z");
    expect(classifyFinancialDueStatus(dueTomorrow, now, timeZone, 0)).toBe("FUTURE");
  });

  it("midnight boundary: a due date exactly at UTC midnight the day AFTER local 'today' is still UPCOMING, not DUE_TODAY, for a UTC+3 zone", () => {
    // now = local June 15. dueDate stored as 2026-06-15T21:00:00Z = local June 16, 00:00 — i.e. the very first instant of the next local day.
    const dueAtNextLocalMidnight = new Date("2026-06-15T21:00:00.000Z");
    expect(classifyFinancialDueStatus(dueAtNextLocalMidnight, now, timeZone)).toBe("UPCOMING");
  });
});
