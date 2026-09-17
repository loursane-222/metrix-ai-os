import {
  describe,
  expect,
  it
} from "vitest";

import type {
  CalendarPresentationEvent
} from "../../src/lib/presentation/contracts";

import {
  addMonths,
  eventsForDay,
  isSameDay,
  layoutTimedEvents,
  monthGridDays,
  navigateReferenceDate,
  nowIndicatorPercent,
  startOfDay,
  weekDays
} from "../../src/components/metrix-view/calendar-layout";

function event(
  overrides: Partial<CalendarPresentationEvent>
): CalendarPresentationEvent {
  return {
    id: "event_1",
    title: "Test Event",
    startsAt: "2026-09-18T13:00:00.000Z",
    endsAt: "2026-09-18T13:00:00.000Z",
    allDay: false,
    ...overrides
  };
}

describe("calendar-layout — DAY", () => {
  it(
    "positions a timed event at the percentage of the day matching its local hour",
    () => {
      // 2026-09-18T13:00:00.000Z is 16:00 local in a UTC+3 test
      // environment (Europe/Istanbul, matching the acceptance example) —
      // the layout function positions purely by the JS Date's own local
      // hour/minute, exactly what the browser's local rendering already
      // relies on for calendar_list today.
      const day = startOfDay(
        new Date("2026-09-18T13:00:00.000Z")
      );

      const positioned = layoutTimedEvents(
        [
          event({
            id: "task_1",
            title: "Takvim testi",
            startsAt: "2026-09-18T13:00:00.000Z",
            endsAt: "2026-09-18T13:00:00.000Z"
          })
        ],
        day
      );

      expect(positioned).toHaveLength(1);

      const expectedHour =
        new Date("2026-09-18T13:00:00.000Z").getHours();

      const expectedTopPercent =
        (expectedHour * 60) / (24 * 60) * 100;

      expect(
        positioned[0]!.topPercent
      ).toBeCloseTo(expectedTopPercent, 5);

      // A zero-duration task marker still occupies a legible minimum
      // block (30 minutes) rather than collapsing to zero height.
      expect(
        positioned[0]!.heightPercent
      ).toBeCloseTo((30 / (24 * 60)) * 100, 5);
    }
  );

  it(
    "resolves overlapping events into distinct side-by-side columns",
    () => {
      const day = startOfDay(new Date("2026-09-18T00:00:00.000Z"));

      const positioned = layoutTimedEvents(
        [
          event({
            id: "a",
            startsAt: "2026-09-18T09:00:00.000Z",
            endsAt: "2026-09-18T10:00:00.000Z"
          }),
          event({
            id: "b",
            startsAt: "2026-09-18T09:30:00.000Z",
            endsAt: "2026-09-18T10:30:00.000Z"
          }),
          event({
            id: "c",
            startsAt: "2026-09-18T14:00:00.000Z",
            endsAt: "2026-09-18T15:00:00.000Z"
          })
        ],
        day
      );

      const a = positioned.find(p => p.event.id === "a")!;
      const b = positioned.find(p => p.event.id === "b")!;
      const c = positioned.find(p => p.event.id === "c")!;

      // a and b overlap in time -> distinct columns, sharing the same
      // column count.
      expect(a.column).not.toBe(b.column);
      expect(a.columns).toBe(2);
      expect(b.columns).toBe(2);

      // c does not overlap anything -> its own single-column cluster.
      expect(c.columns).toBe(1);
      expect(c.column).toBe(0);
    }
  );

  it(
    "an empty day layout is simply an empty, well-defined array",
    () => {
      const day = startOfDay(new Date("2026-09-18T00:00:00.000Z"));

      expect(layoutTimedEvents([], day)).toEqual([]);
      expect(eventsForDay([], day)).toEqual([]);
    }
  );

  it(
    "the current-time indicator only appears for today, at the correct position",
    () => {
      const now = new Date("2026-09-18T13:30:00.000Z");
      const today = startOfDay(now);
      // A week away — safely a different calendar day under any
      // realistic timezone offset, not just this environment's own.
      const otherDay = startOfDay(
        new Date("2026-09-25T00:00:00.000Z")
      );

      expect(isSameDay(today, now)).toBe(true);

      const percent = nowIndicatorPercent(today, now);

      expect(percent).toBeDefined();

      const expectedMinutes =
        now.getHours() * 60 + now.getMinutes();

      expect(percent).toBeCloseTo(
        (expectedMinutes / (24 * 60)) * 100,
        5
      );

      expect(
        nowIndicatorPercent(otherDay, now)
      ).toBeUndefined();
    }
  );
});

describe("calendar-layout — WEEK", () => {
  it(
    "places each event on its own correct date within the 7-day week",
    () => {
      const referenceDate = new Date("2026-09-16T00:00:00.000Z");

      const days = weekDays(referenceDate);

      expect(days).toHaveLength(7);

      const wednesdayEvent = event({
        id: "wed",
        startsAt: "2026-09-16T10:00:00.000Z",
        endsAt: "2026-09-16T11:00:00.000Z"
      });

      const fridayEvent = event({
        id: "fri",
        startsAt: "2026-09-18T13:00:00.000Z",
        endsAt: "2026-09-18T13:00:00.000Z"
      });

      const events = [wednesdayEvent, fridayEvent];

      for (const day of days) {
        const found = eventsForDay(events, day);

        if (isSameDay(day, new Date("2026-09-16T10:00:00.000Z"))) {
          expect(found.map(e => e.id)).toEqual(["wed"]);
        } else if (
          isSameDay(day, new Date("2026-09-18T13:00:00.000Z"))
        ) {
          expect(found.map(e => e.id)).toEqual(["fri"]);
        } else {
          expect(found).toEqual([]);
        }
      }
    }
  );
});

describe("calendar-layout — MONTH", () => {
  it(
    "places an event on its correct calendar date within the month grid",
    () => {
      // Mid-month, well clear of any month boundary under any realistic
      // timezone offset.
      const referenceDate = new Date("2026-09-15T00:00:00.000Z");
      const days = monthGridDays(referenceDate);

      // A conventional Monday-first month grid: exactly 6 full weeks.
      expect(days).toHaveLength(42);

      const target = new Date("2026-09-18T13:00:00.000Z");
      const matchingDay = days.find(day => isSameDay(day, target));

      expect(matchingDay).toBeDefined();

      const found = eventsForDay(
        [
          event({
            id: "task_1",
            startsAt: "2026-09-18T13:00:00.000Z",
            endsAt: "2026-09-18T13:00:00.000Z"
          })
        ],
        matchingDay!
      );

      expect(found.map(e => e.id)).toEqual(["task_1"]);
    }
  );

  it(
    "correctly computes month grid boundaries including leading/trailing days",
    () => {
      // September 2026 starts on a Tuesday — the grid must lead in with
      // the final Monday of August.
      const days = monthGridDays(
        new Date("2026-09-15T00:00:00.000Z")
      );

      expect(days[0]!.getMonth()).toBe(7); // August (0-indexed)
      expect(days[0]!.getDay()).toBe(1); // Monday

      const inMonthDays = days.filter(
        day => day.getMonth() === 8 && day.getFullYear() === 2026
      );

      expect(inMonthDays).toHaveLength(30);
    }
  );

  it(
    "handles leap-year February correctly",
    () => {
      const leapYearDays = monthGridDays(
        new Date("2028-02-10T00:00:00.000Z")
      );

      const inMonth = leapYearDays.filter(
        day => day.getMonth() === 1 && day.getFullYear() === 2028
      );

      expect(inMonth).toHaveLength(29);

      const nonLeapYearDays = monthGridDays(
        new Date("2026-02-10T00:00:00.000Z")
      );

      const inMonthNonLeap = nonLeapYearDays.filter(
        day => day.getMonth() === 1 && day.getFullYear() === 2026
      );

      expect(inMonthNonLeap).toHaveLength(28);
    }
  );
});

describe("calendar-layout — navigation", () => {
  it(
    "steps DAY/WEEK/MONTH forward and backward correctly",
    () => {
      const reference = new Date("2026-09-18T12:00:00.000Z");

      const nextDay = navigateReferenceDate(reference, "DAY", 1);
      expect(nextDay.getDate()).toBe(19);

      const prevDay = navigateReferenceDate(reference, "DAY", -1);
      expect(prevDay.getDate()).toBe(17);

      const nextWeek = navigateReferenceDate(reference, "WEEK", 1);
      expect(nextWeek.getDate()).toBe(25);

      const prevWeek = navigateReferenceDate(reference, "WEEK", -1);
      expect(prevWeek.getDate()).toBe(11);

      const nextMonth = navigateReferenceDate(reference, "MONTH", 1);
      expect(nextMonth.getMonth()).toBe(9); // October
      expect(nextMonth.getFullYear()).toBe(2026);

      const prevMonth = navigateReferenceDate(reference, "MONTH", -1);
      expect(prevMonth.getMonth()).toBe(7); // August
    }
  );

  it(
    "never rolls a short-month navigation over into the wrong month (the classic Jan 31 + 1 month bug)",
    () => {
      const jan31 = new Date("2026-01-31T12:00:00.000Z");

      const nextMonth = addMonths(jan31, 1);

      // A naive setMonth(month + 1) on Jan 31 lands on Mar 3 (2026 is
      // not a leap year, Feb has 28 days) — this must land in February.
      expect(nextMonth.getMonth()).toBe(1); // February
      expect(nextMonth.getFullYear()).toBe(2026);

      const acrossYearEnd = addMonths(
        new Date("2026-12-15T00:00:00.000Z"),
        1
      );

      expect(acrossYearEnd.getMonth()).toBe(0); // January
      expect(acrossYearEnd.getFullYear()).toBe(2027);
    }
  );
});
