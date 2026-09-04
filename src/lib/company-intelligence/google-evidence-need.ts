import { isExplicitGmailRequest } from "@/lib/integrations/gmail/gmail-request-detection";
import { isExplicitGoogleCalendarRequest } from "@/lib/integrations/google-calendar/google-calendar-request-detection";

export type GoogleEvidenceNeed = {
  readonly needsEmail: boolean;
  readonly needsCalendar: boolean;
  /** Only set when needsCalendar and the message names a bounded window ("bugün" = 1, "bu hafta"/"önümüzdeki hafta" = 7); otherwise the Calendar service's own default "upcoming" window applies. */
  readonly calendarRangeDays: number | null;
};

const TODAY_PATTERN = /\bbugün\b/i;
// No \b around the Turkish-letter-leading alternatives ("önümüzdeki...") —
// JS regex \b only recognizes ASCII \w, so a boundary right before "ö" is
// never detected (same pitfall fixed in identity-resolution.ts's
// normalizeEntityDisplayName). These are distinctive multi-word phrases,
// so plain substring matching is safe without the anchor.
const WEEK_PATTERN = /(bu hafta|önümüzdeki hafta|gelecek hafta|haftaya)/i;

/**
 * Pure, deterministic — no LLM, no I/O. Mirrors gmail.service.ts's own
 * isExplicitGmailRequest exactly in spirit (reused directly for the email
 * signal); isExplicitGoogleCalendarRequest is its Calendar-domain twin.
 * Returns null when neither fires, so callers never build evidence for a
 * turn that never asked for Google data.
 */
export function detectGoogleEvidenceNeed(message: string): GoogleEvidenceNeed | null {
  const needsEmail = isExplicitGmailRequest(message);
  const needsCalendar = isExplicitGoogleCalendarRequest(message);
  if (!needsEmail && !needsCalendar) return null;

  let calendarRangeDays: number | null = null;
  if (needsCalendar) {
    if (TODAY_PATTERN.test(message)) calendarRangeDays = 1;
    else if (WEEK_PATTERN.test(message)) calendarRangeDays = 7;
  }

  return { needsEmail, needsCalendar, calendarRangeDays };
}
