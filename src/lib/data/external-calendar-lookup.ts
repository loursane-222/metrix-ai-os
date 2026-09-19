import { requireOrganizationAccess } from "../auth/organization-access";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";
import {
  nylasListEvents,
  type FetchLike,
  type NylasRecord
} from "../integrations/nylas/nylas-client";

export type ExternalCalendarEventReality = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

/**
 * What the external (Nylas/Google) calendar read actually established.
 * `events: []` only ever means "the calendar is empty" together with
 * READ_OK — every other status is a reason the list cannot be trusted as
 * complete:
 *  - NOT_CONNECTED: no Nylas connection; there is no external calendar.
 *  - READ_OK:       the provider answered and every returned event was
 *                   represented.
 *  - READ_PARTIAL:  the provider answered but some returned events could
 *                   not be represented, so the list is incomplete.
 *  - READ_FAILED:   a connection exists but the provider read failed
 *                   (4xx/5xx, timeout, network, unreadable response).
 */
export type ExternalCalendarStatus =
  | "NOT_CONNECTED"
  | "READ_OK"
  | "READ_PARTIAL"
  | "READ_FAILED";

export type ExternalCalendarRead = {
  status: ExternalCalendarStatus;
  events: ExternalCalendarEventReality[];
  skippedCount: number;
};

const MISSING_TITLE = "(Başlık yok)";

// Nylas's "when" object has several documented shapes (timespan/date/
// datespan/time) depending on the event; only the ones this operation's
// Presentation contract can render (a start+end instant, or an all-day
// span) are mapped. An event in an unrecognized shape is never guessed;
// it is counted as skipped so the read is reported as incomplete instead
// of silently looking like an empty calendar.
function toReality(record: NylasRecord): ExternalCalendarEventReality | null {
  const id = typeof record.id === "string" ? record.id : null;
  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const title = rawTitle.length > 0 ? rawTitle : MISSING_TITLE;
  const when = record.when;

  if (!id || typeof when !== "object" || when === null) {
    return null;
  }

  const whenRecord = when as Record<string, unknown>;

  if (
    whenRecord.object === "timespan" &&
    typeof whenRecord.start_time === "number" &&
    typeof whenRecord.end_time === "number"
  ) {
    return {
      id: `nylas:${id}`,
      title,
      startsAt: new Date(whenRecord.start_time * 1000).toISOString(),
      endsAt: new Date(whenRecord.end_time * 1000).toISOString(),
      allDay: false
    };
  }

  if (whenRecord.object === "date" && typeof whenRecord.date === "string") {
    const startsAt = new Date(`${whenRecord.date}T00:00:00.000Z`).toISOString();
    return { id: `nylas:${id}`, title, startsAt, endsAt: startsAt, allDay: true };
  }

  if (
    whenRecord.object === "datespan" &&
    typeof whenRecord.start_date === "string" &&
    typeof whenRecord.end_date === "string"
  ) {
    return {
      id: `nylas:${id}`,
      title,
      startsAt: new Date(`${whenRecord.start_date}T00:00:00.000Z`).toISOString(),
      endsAt: new Date(`${whenRecord.end_date}T00:00:00.000Z`).toISOString(),
      allDay: true
    };
  }

  return null;
}

function toEpochSeconds(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;

  const millis = Date.parse(iso);

  if (Number.isNaN(millis)) {
    throw new RangeError("Invalid calendar range boundary");
  }

  return Math.floor(millis / 1000);
}

/**
 * Read-only external calendar reality for one organization's connected
 * Nylas grant — merged into calendar_list's own result, never a second
 * Calendar Presentation. A provider failure never throws (an outage in a
 * connected external source must not break METRIX's own native calendar)
 * and never becomes an empty list either: it is reported as READ_FAILED
 * so the caller can keep the native events while stating that the
 * external calendar could not be verified.
 */
export async function lookupExternalCalendarEvents(
  input: {
    actorUserId: string;
    organizationId: string;
    startsBefore?: string;
    endsAfter?: string;
  },
  fetchImpl?: FetchLike
): Promise<ExternalCalendarRead> {
  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const connection = await loadNylasConnection(input.organizationId);

  if (!connection) {
    return { status: "NOT_CONNECTED", events: [], skippedCount: 0 };
  }

  const start = toEpochSeconds(input.endsAfter);
  const end = toEpochSeconds(input.startsBefore);

  let records: NylasRecord[];

  try {
    records = await nylasListEvents(
      { grantId: connection.grantId, start, end },
      fetchImpl
    );
  } catch {
    return { status: "READ_FAILED", events: [], skippedCount: 0 };
  }

  const events = records
    .map(toReality)
    .filter((event): event is ExternalCalendarEventReality => event !== null);

  const skippedCount = records.length - events.length;

  return {
    status: skippedCount > 0 ? "READ_PARTIAL" : "READ_OK",
    events,
    skippedCount
  };
}
