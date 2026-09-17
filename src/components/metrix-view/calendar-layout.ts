import type { CalendarPresentationEvent } from "../../lib/presentation/contracts";

export type CalendarMode = "MONTH" | "WEEK" | "DAY";

const MINUTES_PER_DAY = 24 * 60;

// Visual-only minimum so a zero-duration task marker (startsAt === endsAt)
// still occupies a legible block on the DAY/WEEK time grid. Never changes
// the underlying canonical startsAt/endsAt values themselves.
const MIN_EVENT_MINUTES = 30;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// Monday = 0 .. Sunday = 6, matching the existing WEEKDAY_SHORT/LONG order.
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  day.setDate(day.getDate() - mondayIndex(day));
  return day;
}

export function addDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

// Resets to day 1 before applying the month delta. Month navigation means
// "which month grid to show", never a specific day-of-month — resetting
// avoids the classic Date rollover bug (e.g. Jan 31 plus one month
// landing on Mar 3 instead of Feb 28/29) entirely, by construction.
export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function navigateReferenceDate(
  current: Date,
  mode: CalendarMode,
  direction: 1 | -1
): Date {
  if (mode === "MONTH") return addMonths(current, direction);
  if (mode === "WEEK") return addDays(current, direction * 7);
  return addDays(current, direction);
}

// 42 cells (6 full weeks), Monday-first, including the leading/trailing
// days of the adjacent months a conventional month grid needs.
export function monthGridDays(referenceDate: Date): Date[] {
  const monthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function weekDays(referenceDate: Date): Date[] {
  const start = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function eventsForDay(
  events: CalendarPresentationEvent[],
  day: Date
): CalendarPresentationEvent[] {
  return events
    .filter(event => {
      const start = startOfDay(new Date(event.startsAt));
      const end = startOfDay(new Date(event.endsAt));
      return day >= start && day <= end;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function allDayEventsForDay(
  events: CalendarPresentationEvent[],
  day: Date
): CalendarPresentationEvent[] {
  return eventsForDay(events, day).filter(event => event.allDay);
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export type PositionedEvent = {
  event: CalendarPresentationEvent;
  topPercent: number;
  heightPercent: number;
  column: number;
  columns: number;
};

/**
 * Lays out one day's timed (non-allDay) events on a 24h vertical axis as
 * top/height percentages, resolving overlaps into side-by-side columns
 * (a standard greedy interval-column assignment) rather than stacking
 * them on top of each other unreadably. Pure and deterministic: the same
 * events for the same day always produce the same layout.
 */
export function layoutTimedEvents(
  events: CalendarPresentationEvent[],
  day: Date
): PositionedEvent[] {
  const timed = eventsForDay(events, day).filter(event => !event.allDay);

  const withMinutes = timed
    .map(event => {
      const start = new Date(event.startsAt);
      const end = new Date(event.endsAt);

      const startMinutes = isSameDay(start, day)
        ? minutesOfDay(start)
        : 0;

      const rawEndMinutes = isSameDay(end, day)
        ? minutesOfDay(end)
        : MINUTES_PER_DAY;

      const endMinutes = Math.min(
        Math.max(rawEndMinutes, startMinutes + MIN_EVENT_MINUTES),
        MINUTES_PER_DAY
      );

      return { event, startMinutes, endMinutes };
    })
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
    );

  const positioned: PositionedEvent[] = [];

  let cluster: typeof withMinutes = [];
  let clusterMaxEnd = -Infinity;

  function flushCluster(): void {
    if (cluster.length === 0) return;

    const columnEnds: number[] = [];
    const assigned: {
      item: (typeof withMinutes)[number];
      column: number;
    }[] = [];

    for (const item of cluster) {
      let placedColumn = -1;

      for (let column = 0; column < columnEnds.length; column += 1) {
        if (item.startMinutes >= columnEnds[column]!) {
          columnEnds[column] = item.endMinutes;
          placedColumn = column;
          break;
        }
      }

      if (placedColumn === -1) {
        columnEnds.push(item.endMinutes);
        placedColumn = columnEnds.length - 1;
      }

      assigned.push({ item, column: placedColumn });
    }

    const totalColumns = columnEnds.length;

    for (const { item, column } of assigned) {
      positioned.push({
        event: item.event,
        topPercent: (item.startMinutes / MINUTES_PER_DAY) * 100,
        heightPercent:
          ((item.endMinutes - item.startMinutes) / MINUTES_PER_DAY) * 100,
        column,
        columns: totalColumns
      });
    }

    cluster = [];
    clusterMaxEnd = -Infinity;
  }

  for (const item of withMinutes) {
    if (cluster.length > 0 && item.startMinutes >= clusterMaxEnd) {
      flushCluster();
    }

    cluster.push(item);
    clusterMaxEnd = Math.max(clusterMaxEnd, item.endMinutes);
  }

  flushCluster();

  return positioned;
}

// Returns the vertical position (0-100) of "now" on a day's time axis,
// or undefined when `day` is not the same calendar day as `now` — the
// caller uses this to decide whether to draw a current-time indicator.
export function nowIndicatorPercent(
  day: Date,
  now: Date = new Date()
): number | undefined {
  if (!isSameDay(day, now)) return undefined;
  return (minutesOfDay(now) / MINUTES_PER_DAY) * 100;
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const HOURS_OF_DAY: readonly number[] = Array.from(
  { length: 24 },
  (_, hour) => hour
);
