// Deterministic period resolution for artifact datasets — mirrors the same
// principle business-navigation.ts's calendarDateAt already established for
// Calendar ("today"/"tomorrow" are keywords the model supplies; the actual
// date always comes from the server's real clock, never model math). A
// relative period like "geçen ay" must resolve to the same real calendar
// boundaries regardless of what the model believes today is.

export type ResolvedPeriod = Readonly<{
  from: Date;
  to: Date; // exclusive upper bound
  label: string; // human-readable, e.g. "Ağustos 2026"
  isoLabel: string; // stable, filename-safe, e.g. "2026-08"
}>;

const TURKISH_MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

function partsAt(instant: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return { year: Number(part("year")), month: Number(part("month")) };
}

// Month boundaries are computed as UTC instants representing local midnight
// in the target timezone's calendar date — sufficient precision for a
// day-granularity report period, consistent with calendarDateAt's own
// approach of treating the timezone-local calendar date as the unit of
// truth rather than doing full IANA offset arithmetic.
function monthStartUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

export function resolvePreviousCalendarMonthRange(instant: Date, timeZone: string): ResolvedPeriod {
  const { year, month } = partsAt(instant, timeZone);
  const currentMonthStart = monthStartUtc(year, month);
  const previousMonthStart = month === 1 ? monthStartUtc(year - 1, 12) : monthStartUtc(year, month - 1);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonthIndex = month === 1 ? 12 : month - 1;
  return Object.freeze({
    from: previousMonthStart,
    to: currentMonthStart,
    label: `${TURKISH_MONTH_NAMES[previousMonthIndex - 1]} ${previousYear}`,
    isoLabel: `${previousYear}-${String(previousMonthIndex).padStart(2, "0")}`,
  });
}
