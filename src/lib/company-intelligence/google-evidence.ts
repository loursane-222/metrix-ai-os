import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import type { GmailMessageSource } from "@/lib/integrations/gmail/gmail.types";
import { googleConnectorAdapter } from "./google-connector-adapter";
import { resolveCanonicalCalendarProjection } from "./calendar-projection";
import { emitCompanyIntelligenceTelemetry } from "./telemetry";
import type { GoogleEvidenceNeed } from "./google-evidence-need";

const EVIDENCE_ITEM_LIMIT = 5;
// Unbounded "upcoming" calendar questions ("yaklaşan toplantılarım") need a
// concrete window for the canonical projection's range query — 14 days
// matches this feature's original bounded-evidence intent without needing
// an actually-unbounded query.
const DEFAULT_UPCOMING_WINDOW_DAYS = 14;

export type GoogleEntityResolution =
  | { readonly status: "NOT_APPLICABLE" }
  | { readonly status: "RESOLVED"; readonly customerName: string; readonly email: string | null }
  | { readonly status: "AMBIGUOUS"; readonly candidateNames: readonly string[] }
  | { readonly status: "NOT_FOUND" };

type ReadStatus = "OK" | "UNAVAILABLE" | "SKIPPED";

export type CompactGmailEvidence = { readonly sender: string; readonly subject: string; readonly receivedAt: string; readonly snippet: string };
export type CompactCalendarEvidence = { readonly title: string; readonly startAt: string; readonly endAt: string; readonly attendees: readonly string[] };

export type GoogleEvidenceResult = {
  readonly connected: boolean;
  readonly entityResolution: GoogleEntityResolution;
  readonly gmail: { readonly status: ReadStatus; readonly messages: readonly CompactGmailEvidence[] };
  readonly calendar: { readonly status: ReadStatus; readonly events: readonly CompactCalendarEvidence[] };
};

/**
 * The one seam route.ts calls (mirrors resolveLiveExternalEvidence's own
 * role for web evidence) — everything Google-specific (entity resolution,
 * parallel Gmail/Calendar reads, compacting) lives here, never in route.ts
 * itself. Reads exclusively through googleConnectorAdapter (Company
 * Intelligence's Google ConnectorAdapter) — no raw Google REST call, no
 * direct Prisma token read, here or in route.ts.
 */
export async function resolveGoogleEvidence(
  need: GoogleEvidenceNeed,
  context: { readonly organizationId: string; readonly userId: string; readonly entityReference: string | null },
): Promise<GoogleEvidenceResult> {
  // Email is solely Google-backed, so its own connection state gates it —
  // but calendar is federated (native + Google, see calendar-projection.ts)
  // and must keep working from native alone even when no Google account is
  // connected at all; it is deliberately NOT gated behind this check.
  const health = await googleConnectorAdapter.health(context.organizationId);
  const googleConnected = health.status !== "UNAVAILABLE";

  // Entity resolution reuses the exact same, already-canonical resolver
  // business-navigation itself uses for "Atlas'ın kaydını aç" — not a
  // second, Google-specific matching algorithm. No fuzzy tier; AMBIGUOUS/
  // NOT_FOUND are real, surfaced outcomes, never guessed past.
  let entityResolution: GoogleEntityResolution = { status: "NOT_APPLICABLE" };
  let resolvedEmail: string | null = null;
  if (context.entityReference?.trim()) {
    const customers = await listCustomers({ organizationId: context.organizationId, status: "ACTIVE" });
    const resolution = resolveCustomerReference(customers, context.entityReference);
    if (resolution.status === "RESOLVED") {
      entityResolution = { status: "RESOLVED", customerName: resolution.customer.displayName, email: resolution.customer.email };
      resolvedEmail = resolution.customer.email;
    } else if (resolution.status === "AMBIGUOUS") {
      entityResolution = { status: "AMBIGUOUS", candidateNames: resolution.options.map((option) => option.displayName) };
    } else {
      entityResolution = { status: "NOT_FOUND" };
    }
  }

  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + (need.calendarRangeDays ?? DEFAULT_UPCOMING_WINDOW_DAYS) * 86_400_000);

  // Unified Calendar Truth: calendar evidence comes from the exact same
  // canonical projection Calendar Workspace reads (calendar-projection.ts)
  // — never a Google-only read here. This is what makes a real event
  // narrated in conversation guaranteed to also be the event Workspace
  // shows if the user opens it the same turn; it also means native events
  // now reach conversation evidence too, not only Google's.
  const [gmailOutcome, projection] = await Promise.all([
    need.needsEmail && googleConnected
      ? googleConnectorAdapter.read({ organizationId: context.organizationId, factScope: "email.recentMessages", params: { userId: context.userId, query: resolvedEmail ? `from:${resolvedEmail} OR to:${resolvedEmail}` : undefined } })
      : null,
    need.needsCalendar
      ? resolveCanonicalCalendarProjection({ organizationId: context.organizationId, userId: context.userId, rangeStart, rangeEnd, query: resolvedEmail ?? undefined })
      : null,
  ]);

  const gmailMessages = gmailOutcome?.status === "OK" ? (gmailOutcome.value as GmailMessageSource[]) : [];
  const calendarEvents: CompactCalendarEvidence[] = projection
    ? [
        ...projection.nativeEvents.map((row) => toCompactNativeEvent(row)),
        ...projection.googleEvents.map((event) => ({ title: event.title, startAt: event.startAt, endAt: event.endAt, attendees: event.attendees })),
      ].slice(0, EVIDENCE_ITEM_LIMIT)
    : [];
  // Both sources failing is the only real "couldn't check" case — one
  // working source with zero matching events is a genuine, honest empty
  // result, not a failure (rule 5: a down provider degrades coverage, it
  // never turns a real empty calendar into a fabricated error or vice versa).
  const calendarFailed = projection ? projection.sourceStatuses.METRIX_NATIVE !== "OK" && projection.sourceStatuses.GOOGLE === "UNAVAILABLE" : false;

  emitCompanyIntelligenceTelemetry("CompanyIntelligence", {
    event: "google_evidence_resolved", organizationId: context.organizationId,
    needsEmail: need.needsEmail, needsCalendar: need.needsCalendar,
    googleConnected, entityResolutionStatus: entityResolution.status,
    gmailStatus: !need.needsEmail ? "SKIPPED" : gmailOutcome?.status ?? "SKIPPED", gmailItemCount: gmailMessages.length,
    calendarNativeStatus: !need.needsCalendar ? "SKIPPED" : projection?.sourceStatuses.METRIX_NATIVE ?? "SKIPPED",
    calendarGoogleStatus: !need.needsCalendar ? "SKIPPED" : projection?.sourceStatuses.GOOGLE ?? "SKIPPED",
    calendarItemCount: calendarEvents.length,
  });

  return {
    connected: googleConnected,
    entityResolution,
    gmail: {
      status: !need.needsEmail ? "SKIPPED" : !googleConnected ? "UNAVAILABLE" : gmailOutcome?.status === "OK" ? "OK" : "UNAVAILABLE",
      // Compact, relevant-item evidence only — never the full message body
      // (GmailMessageSource.body, up to 2500 chars) — snippet is already
      // truncated to ~500 chars in gmail.service.ts.
      messages: gmailMessages.slice(0, EVIDENCE_ITEM_LIMIT).map((message) => ({ sender: message.sender, subject: message.subject, receivedAt: message.receivedAt, snippet: message.snippet })),
    },
    calendar: {
      status: !need.needsCalendar ? "SKIPPED" : calendarFailed ? "UNAVAILABLE" : "OK",
      // Never the free-text description — title/time/attendees is what an
      // executive-priority answer or entity verification actually needs.
      events: calendarEvents,
    },
  };
}

/** Native rows keep their own raw shape (see calendar-projection.ts) — this is the one place conversation evidence trims one down to the same compact shape Google events already get. */
function toCompactNativeEvent(row: Record<string, unknown>): CompactCalendarEvidence {
  return {
    title: typeof row.title === "string" ? row.title : "(Başlıksız etkinlik)",
    startAt: String(row.occurrenceStartAt ?? row.startAt ?? ""),
    endAt: String(row.occurrenceEndAt ?? row.endAt ?? ""),
    attendees: [],
  };
}

/**
 * The one prompt-evidence line this feature ever injects — same "structured,
 * not user-facing copy" convention every other evidence source in route.ts
 * already uses (business-navigation, canonical business facts, external
 * evidence). Deliberately instructs the model to never say "Gmail"/"Google
 * Calendar"/"API"/"connector" to the user — those are implementation
 * details, not something the user asked about.
 */
export function buildGoogleEvidencePromptLine(need: GoogleEvidenceNeed, result: GoogleEvidenceResult): string {
  const parts: string[] = [];

  // Email is solely Google-backed — no connection means no email evidence
  // is even attempted (see resolveGoogleEvidence). Calendar is federated
  // (native + Google), so it is deliberately NOT gated the same way: a
  // disconnected Google account still gets real native calendar evidence
  // below, never a blanket "no access" for the whole turn.
  if (need.needsEmail && !result.connected) {
    parts.push(`The user's message needs access to their connected email, but no Google account is connected for this user right now. Say plainly, in natural non-technical language (never say "Gmail", "API", "OAuth", or "connector" to the user), that you don't currently have access to their email and they can connect it if they want this kind of answer. Never invent or guess an email.`);
  }
  if (result.entityResolution.status === "AMBIGUOUS") {
    parts.push(`The named entity the user mentioned matches more than one existing record: ${result.entityResolution.candidateNames.join(", ")}. Ask the user which one they mean before describing any email/meeting as being about that entity — never guess which one.`);
  } else if (result.entityResolution.status === "NOT_FOUND") {
    parts.push(`No existing customer record matches the name the user mentioned. Say this honestly rather than inventing or assuming who they meant.`);
  } else if (result.entityResolution.status === "RESOLVED" && !result.entityResolution.email) {
    parts.push(`The customer "${result.entityResolution.customerName}" was identified but has no email on file, so the results below could not be filtered to messages/events specifically involving them — say this honestly if it matters to your answer, rather than implying the results are already scoped to that customer.`);
  }

  if (need.needsEmail && result.connected) {
    if (result.gmail.status === "OK") {
      parts.push(`Real recent email evidence (structured, not user-facing copy — never call this "Gmail" or an "API" to the user, just say "e-postaların"): ${JSON.stringify(result.gmail.messages)}. Use only these real messages; never invent a sender, subject, or email that isn't listed here. If the list is empty, say plainly there is nothing relevant right now.`);
    } else {
      parts.push(`Email retrieval failed just now — say honestly that you couldn't check email right now, and never invent any email content to fill the gap.`);
    }
  }
  if (need.needsCalendar) {
    if (result.calendar.status === "OK") {
      parts.push(`Real upcoming calendar evidence (structured, not user-facing copy — never call this "Google Calendar" or an "API" to the user, just say "takviminde"): ${JSON.stringify(result.calendar.events)}. Use only these real events; never invent a meeting, time, or attendee that isn't listed here. If the list is empty, say plainly there is nothing relevant right now.`);
    } else {
      parts.push(`Calendar retrieval failed just now — say honestly that you couldn't check the calendar right now, and never invent any event to fill the gap.`);
    }
  }

  if (need.needsEmail && need.needsCalendar && result.gmail.status === "OK" && result.calendar.status === "OK") {
    parts.push(`The user asked a combined, executive-priority-style question spanning email and calendar (and possibly other company truth elsewhere in this prompt). Do not just list the two separately — synthesize a real executive judgment about what genuinely needs attention, grounded only in the real evidence given; never fabricate a priority, urgency, or connection between items that the evidence doesn't actually support.`);
  }

  return parts.join(" ");
}
