/**
 * Financial due-date/day-boundary math for Phase 12. Follows the SAME
 * `Intl.DateTimeFormat("en-CA", { timeZone, ... })` idiom already
 * independently duplicated in business-navigation.ts,
 * field-visit-weekly-summary.service.ts and executive-signal-snapshot.service.ts
 * (none of them export a shared helper — this repo's own convention is to
 * duplicate this small idiom per call site rather than centralize it).
 *
 * Canonical user timezone authority: authenticated `User.timezone`, default
 * "Europe/Istanbul" (see DEFAULT_TIME_ZONE). Never use server-local time or
 * a naive UTC day for a due/overdue boundary — `new Date().getUTCDate()`-
 * style math silently shifts "today" by the server's UTC offset from the
 * user's actual calendar day, which is exactly the class of bug this module
 * exists to prevent.
 */

export const DEFAULT_TIME_ZONE = "Europe/Istanbul";

export type FinancialDueStatus = "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "FUTURE";

/** "YYYY-MM-DD" — the calendar day `instant` falls on on the wall clock of `timeZone`. */
export function dateStringInTimeZone(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "YYYY-MM-DD" + N calendar days, pure date-string arithmetic — never re-enters a timezone. */
export function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Classifies a canonical due/maturity date against "today" in `timeZone`.
 * `upcomingWindowDays` bounds how far into the future something still counts
 * as UPCOMING (vs. just FUTURE, out of reminder scope) — the calendar
 * projection route ignores this (it shows whatever the requested date range
 * asks for); only the notification scheduler uses the UPCOMING/FUTURE split.
 */
export function classifyFinancialDueStatus(dueDate: Date, now: Date, timeZone: string = DEFAULT_TIME_ZONE, upcomingWindowDays = 3): FinancialDueStatus {
  const dueDateString = dateStringInTimeZone(dueDate, timeZone);
  const todayString = dateStringInTimeZone(now, timeZone);
  if (dueDateString < todayString) return "OVERDUE";
  if (dueDateString === todayString) return "DUE_TODAY";
  return dueDateString <= addDaysToDateString(todayString, upcomingWindowDays) ? "UPCOMING" : "FUTURE";
}
