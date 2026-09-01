import { dateStringInTimeZone } from "@/lib/core/calendar/calendar-timezone";
import { resolveManagementPeriod } from "@/lib/management-period";

export type ResolvedPeriod = Readonly<{
  from: Date;
  to: Date; // exclusive upper bound
  label: string; // human-readable, e.g. "Ağustos 2026"
  isoLabel: string; // stable, filename-safe, e.g. "2026-08"
}>;

export function resolvePreviousCalendarMonthRange(instant: Date, timeZone: string): ResolvedPeriod {
  const resolved = resolveManagementPeriod({ kind: "PREVIOUS_MONTH", now: instant, timeZone });
  return Object.freeze({
    from: resolved.start,
    to: resolved.end,
    label: resolved.label,
    isoLabel: dateStringInTimeZone(resolved.start, timeZone).slice(0, 7),
  });
}
