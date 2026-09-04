import type { GoogleCalendarEventSource } from "@/lib/integrations/google-calendar/google-calendar.types";
import { nativeConnectorAdapter } from "./native-connector-adapter";
import { googleConnectorAdapter } from "./google-connector-adapter";
import { ensureNativeSourceRegistered } from "./native-source-bootstrap";
import { ensureGoogleSourceRegistered } from "./google-source-bootstrap";
import { emitCompanyIntelligenceTelemetry } from "./telemetry";

/**
 * ROOT CAUSE (Unified Calendar Truth operation): Calendar Workspace
 * (/api/calendar-events, via listCalendarEvents) and conversation Google
 * evidence (previously: resolveGoogleEvidence calling googleConnectorAdapter
 * directly) were two disjoint truth paths for the same question — Workspace
 * only ever queried METRIX Native, conversation only ever queried Google.
 * A real Google-only event was narrated correctly but never appeared in the
 * Workspace the same turn opened, because nothing had ever asked Google for
 * data on Workspace's behalf.
 *
 * This is the ONE seam that fixes that: both /api/calendar-events (Workspace)
 * and google-evidence.ts (conversation) now call resolveCanonicalCalendarProjection
 * for the same range and get back the exact same underlying source reads —
 * one federated (additive, not single-winner) query across every capable,
 * healthy calendar source for the organization, native included. See
 * native-source-bootstrap.ts / google-source-bootstrap.ts's own comments for
 * why this is deliberately NOT run through Truth Authority's PRIMARY/
 * SECONDARY resolver: calendar facts are additive across sources, not a
 * single-winner pick.
 *
 * iCloud/Outlook-ready: a real adapter for either is a new ConnectorAdapter
 * registered the same way googleConnectorAdapter is, plus one more entry in
 * CALENDAR_SOURCES below — no changes to this function's own logic, to
 * Workspace, or to the conversation evidence wiring.
 */
const CALENDAR_SOURCES: ReadonlyArray<{ readonly provider: "METRIX_NATIVE" | "GOOGLE"; readonly factScope: string }> = [
  { provider: "METRIX_NATIVE", factScope: "calendar.events" },
  { provider: "GOOGLE", factScope: "calendar.range" },
];

export type CalendarSourceStatus = "OK" | "UNAVAILABLE" | "NOT_CONNECTED" | "SKIPPED";

export type CanonicalCalendarEvent = {
  readonly canonicalEventId: string;
  readonly provider: "GOOGLE";
  readonly sourceEventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly startAt: string;
  readonly endAt: string;
  readonly allDay: boolean;
  readonly attendees: readonly string[];
  readonly status: "CONFIRMED" | "CANCELLED";
  readonly htmlLink: string | null;
};

export type CanonicalCalendarProjectionResult = {
  /** Raw, unchanged native CalendarEvent rows — the exact shape /api/calendar-events already returned before this operation, so Workspace's existing rendering never has to change. */
  readonly nativeEvents: readonly Record<string, unknown>[];
  readonly googleEvents: readonly CanonicalCalendarEvent[];
  readonly sourceStatuses: { readonly METRIX_NATIVE: CalendarSourceStatus; readonly GOOGLE: CalendarSourceStatus };
};

function toCanonicalGoogleEvent(event: GoogleCalendarEventSource): CanonicalCalendarEvent {
  return {
    canonicalEventId: `google:${event.eventId}`,
    provider: "GOOGLE",
    sourceEventId: event.eventId,
    title: event.title,
    description: event.description || null,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    attendees: event.attendees,
    status: event.status,
    htmlLink: event.htmlLink || null,
  };
}

/**
 * The one federated calendar read. Never throws on a single source's
 * failure — a down/disconnected provider degrades sourceStatuses for that
 * provider only; the other provider's real events are still returned (rule
 * 5's "başarısız source yüzünden tüm calendar query çökmemez").
 */
export async function resolveCanonicalCalendarProjection(input: {
  readonly organizationId: string;
  readonly userId: string;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  /** Entity-linked search (e.g. a customer's email) — applies to Google's own full-text search only; native has no equivalent free-text filter yet. */
  readonly query?: string;
}): Promise<CanonicalCalendarProjectionResult> {
  await Promise.allSettled([ensureNativeSourceRegistered(input.organizationId), ensureGoogleSourceRegistered(input.organizationId)]);

  // allSettled, not all: a thrown error on one source (e.g. a native DB
  // hiccup) must never take down the other source's real, otherwise-healthy
  // read — rule 5's "başarısız source yüzünden tüm calendar query
  // çökmemeli" applies to unexpected exceptions too, not only the
  // controlled NOT_FOUND/UNAVAILABLE statuses each adapter already reports.
  const [nativeSettled, googleSettled] = await Promise.allSettled([
    nativeConnectorAdapter.read({
      organizationId: input.organizationId,
      factScope: CALENDAR_SOURCES[0].factScope,
      params: { rangeStart: input.rangeStart.toISOString(), rangeEnd: input.rangeEnd.toISOString() },
    }),
    googleConnectorAdapter.read({
      organizationId: input.organizationId,
      factScope: CALENDAR_SOURCES[1].factScope,
      params: { userId: input.userId, rangeStart: input.rangeStart.toISOString(), rangeEnd: input.rangeEnd.toISOString(), query: input.query },
    }),
  ]);

  const nativeResult = nativeSettled.status === "fulfilled" ? nativeSettled.value : null;
  const googleResult = googleSettled.status === "fulfilled" ? googleSettled.value : null;

  const nativeEvents = nativeResult?.status === "OK" ? (nativeResult.value as Record<string, unknown>[]) : [];
  const googleRaw = googleResult?.status === "OK" ? (googleResult.value as GoogleCalendarEventSource[]) : [];
  const googleEvents = googleRaw.map(toCanonicalGoogleEvent);

  const sourceStatuses = {
    METRIX_NATIVE: (nativeResult?.status === "OK" ? "OK" : "UNAVAILABLE") as CalendarSourceStatus,
    GOOGLE: (googleResult?.status === "OK" ? "OK" : googleResult?.status === "NOT_FOUND" ? "NOT_CONNECTED" : "UNAVAILABLE") as CalendarSourceStatus,
  };

  emitCompanyIntelligenceTelemetry("CompanyIntelligence", {
    event: "calendar_projection_resolved", organizationId: input.organizationId,
    nativeStatus: sourceStatuses.METRIX_NATIVE, nativeCount: nativeEvents.length,
    googleStatus: sourceStatuses.GOOGLE, googleCount: googleEvents.length,
  });

  return { nativeEvents, googleEvents, sourceStatuses };
}

/**
 * Projects one canonical Google event into the same minimal shape
 * CalendarWorkspace.tsx already reads off every native row (id/title/
 * startAt/occurrenceStartAt/endAt/occurrenceEndAt/allDay/status) — see
 * CalendarWorkspace.tsx's own client-side normalizer. `provider: "GOOGLE"`
 * is the one addition, used client-side to keep a non-native event from
 * being treated as draggable/reschedulable (no calendar WRITE exists for
 * Google in this operation).
 */
export function toWorkspaceCalendarItem(event: CanonicalCalendarEvent): Record<string, unknown> {
  return {
    id: event.canonicalEventId,
    title: event.title,
    startAt: event.startAt,
    occurrenceStartAt: event.startAt,
    endAt: event.endAt,
    occurrenceEndAt: event.endAt,
    allDay: event.allDay,
    status: event.status === "CANCELLED" ? "CANCELLED" : "PLANNED",
    provider: event.provider,
  };
}
