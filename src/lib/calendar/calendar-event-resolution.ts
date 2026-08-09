export type CalendarEventRecord = { id: string; title: string };
export type CalendarEventResolution = { status: "RESOLVED"; event: CalendarEventRecord } | { status: "AMBIGUOUS"; options: CalendarEventRecord[] } | { status: "NOT_FOUND" };
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/[ıi]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g").replace(/[çÇ]/g, "c").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
export function resolveCalendarEventReference(events: readonly CalendarEventRecord[], reference: string): CalendarEventResolution {
  const needle = normalize(reference); if (!needle) return { status: "NOT_FOUND" };
  const exact = events.filter((event) => normalize(event.title) === needle); if (exact.length === 1) return { status: "RESOLVED", event: exact[0]! }; if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = events.filter((event) => normalize(event.title).includes(needle)); if (partial.length === 1) return { status: "RESOLVED", event: partial[0]! }; if (partial.length > 1) return { status: "AMBIGUOUS", options: partial }; return { status: "NOT_FOUND" };
}
