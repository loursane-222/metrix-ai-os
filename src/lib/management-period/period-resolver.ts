import { addDaysToDateString, dateStringInTimeZone } from "@/lib/core/calendar/calendar-timezone";

export type ManagementPeriodKind =
  | "CURRENT_MONTH"
  | "PREVIOUS_MONTH"
  | "CURRENT_WEEK"
  | "PREVIOUS_WEEK"
  | "ROLLING_DAYS"
  | "PREVIOUS_ROLLING_DAYS";

export type ManagementPeriod = Readonly<{
  kind: ManagementPeriodKind;
  label: string;
  start: Date;
  end: Date;
  timeZone: string;
}>;

export type ResolveManagementPeriodInput = Readonly<{
  kind: ManagementPeriodKind;
  now: Date;
  timeZone: string;
  rollingDays?: number;
}>;

type LocalParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"), month: value("month"), day: value("day"),
    hour: value("hour"), minute: value("minute"), second: value("second"),
  };
}

function localDateTimeToInstant(parts: LocalParts, timeZone: string, milliseconds = 0): Date {
  const desiredUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, milliseconds);
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = localParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, milliseconds);
    const correction = desiredUtc - actualAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

function parseDate(date: string): Pick<LocalParts, "year" | "month" | "day"> {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

function midnight(date: string, timeZone: string): Date {
  return localDateTimeToInstant({ ...parseDate(date), hour: 0, minute: 0, second: 0 }, timeZone);
}

function monthStartDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function shiftedMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const value = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

function mondayDate(now: Date, timeZone: string): string {
  const today = dateStringInTimeZone(now, timeZone);
  const { year, month, day } = parseDate(today);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDaysToDateString(today, -(weekday === 0 ? 6 : weekday - 1));
}

function period(kind: ManagementPeriodKind, label: string, start: Date, end: Date, timeZone: string): ManagementPeriod {
  return Object.freeze({ kind, label, start, end, timeZone });
}

/**
 * Canonical management ranges are half-open [start, end). Calendar boundaries
 * are midnight in User.timezone. Weeks follow METRIX's existing Monday-start
 * convention. Rolling windows are N calendar days at the same local wall-clock
 * time, not N*24 elapsed hours; the previous window is the immediately preceding
 * non-overlapping N-calendar-day window.
 */
export function resolveManagementPeriod(input: ResolveManagementPeriodInput): ManagementPeriod {
  if (!Number.isFinite(input.now.getTime())) throw new RangeError("now must be a valid Date");
  // Validate the IANA timezone deterministically before doing any boundary math.
  new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone }).format(input.now);
  const today = dateStringInTimeZone(input.now, input.timeZone);
  const todayParts = parseDate(today);

  if (input.kind === "CURRENT_MONTH" || input.kind === "PREVIOUS_MONTH") {
    const current = { year: todayParts.year, month: todayParts.month };
    const selected = input.kind === "CURRENT_MONTH" ? current : shiftedMonth(current.year, current.month, -1);
    const next = shiftedMonth(selected.year, selected.month, 1);
    const start = midnight(monthStartDate(selected.year, selected.month), input.timeZone);
    const end = input.kind === "CURRENT_MONTH"
      ? input.now
      : midnight(monthStartDate(next.year, next.month), input.timeZone);
    return period(input.kind, `${MONTH_LABELS[selected.month - 1]} ${selected.year}`, start, end, input.timeZone);
  }

  if (input.kind === "CURRENT_WEEK" || input.kind === "PREVIOUS_WEEK") {
    const currentMonday = mondayDate(input.now, input.timeZone);
    const startDate = input.kind === "CURRENT_WEEK" ? currentMonday : addDaysToDateString(currentMonday, -7);
    const end = input.kind === "CURRENT_WEEK" ? input.now : midnight(currentMonday, input.timeZone);
    return period(input.kind, `${startDate} / ${input.kind === "CURRENT_WEEK" ? today : addDaysToDateString(currentMonday, -1)}`, midnight(startDate, input.timeZone), end, input.timeZone);
  }

  const days = input.rollingDays;
  if (!Number.isInteger(days) || (days ?? 0) <= 0) throw new RangeError("rollingDays must be a positive integer");
  const nowLocal = localParts(input.now, input.timeZone);
  const anchorDate = dateStringInTimeZone(input.now, input.timeZone);
  const endDate = input.kind === "ROLLING_DAYS" ? anchorDate : addDaysToDateString(anchorDate, -days!);
  const startDate = addDaysToDateString(endDate, -days!);
  const atLocalTime = (date: string) => localDateTimeToInstant({ ...parseDate(date), hour: nowLocal.hour, minute: nowLocal.minute, second: nowLocal.second }, input.timeZone, input.now.getUTCMilliseconds());
  const start = atLocalTime(startDate);
  const end = input.kind === "ROLLING_DAYS" ? input.now : atLocalTime(endDate);
  return period(input.kind, `${days} günlük dönem`, start, end, input.timeZone);
}

export function resolveComparableManagementPeriods(input: Omit<ResolveManagementPeriodInput, "kind"> & { kind: "CURRENT_MONTH" | "CURRENT_WEEK" | "ROLLING_DAYS" }): Readonly<{ current: ManagementPeriod; previous: ManagementPeriod }> {
  const previousKind = input.kind === "CURRENT_MONTH"
    ? "PREVIOUS_MONTH"
    : input.kind === "CURRENT_WEEK"
      ? "PREVIOUS_WEEK"
      : "PREVIOUS_ROLLING_DAYS";
  return Object.freeze({
    current: resolveManagementPeriod(input),
    previous: resolveManagementPeriod({ ...input, kind: previousKind }),
  });
}
