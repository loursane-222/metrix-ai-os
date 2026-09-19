import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";
import {
  nylasListMessages,
  type FetchLike,
  type NylasRecord
} from "../integrations/nylas/nylas-client";

export type MailMessageReality = {
  // Provider-internal identifier — kept for canonical traceability only,
  // never a human-facing label (see title/subtitle below).
  id: string;
  // Generic display convention read by the shared Presentation
  // projection (title = primary line, subtitle = secondary line) — the
  // same `title` key task/calendar results already use. Derived only
  // from real fields; a missing subject is a fixed placeholder, never
  // an invented one.
  title: string;
  subtitle: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  date: string | null;
  snippet: string | null;
  unread: boolean | null;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
};

export type MailSearchReality = {
  connected: boolean;
  connectedEmail: string | null;
  messages: MailMessageReality[];
};

// Nylas's own reference does not publish a full message object schema
// (see nylas-client.ts's header comment) — the "from" participant list
// is the one commonly documented shape ([{ name, email }]) and is read
// defensively; any other shape degrades to null fields rather than
// throwing, so one unexpected message never breaks the whole search.
export function firstParticipant(
  record: NylasRecord,
  key: string
): { email: string | null; name: string | null } {
  const value = record[key];

  if (!Array.isArray(value) || value.length === 0) {
    return { email: null, name: null };
  }

  const first = value[0];

  if (typeof first !== "object" || first === null) {
    return { email: null, name: null };
  }

  const participant = first as Record<string, unknown>;

  return {
    email: typeof participant.email === "string" ? participant.email : null,
    name: typeof participant.name === "string" ? participant.name : null
  };
}

export const MISSING_SUBJECT_TITLE = "(Konu yok)";
const PREVIEW_MAX_LENGTH = 70;

export function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formatDisplayDate(iso: string, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      ...options,
      timeZone: timezone
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("tr-TR", {
      ...options,
      timeZone: "UTC"
    }).format(new Date(iso));
  }
}

function shortPreview(snippet: string | null): string | null {
  const collapsed = nonEmpty(snippet?.replace(/\s+/g, " ") ?? null);

  if (!collapsed) {
    return null;
  }

  return collapsed.length > PREVIEW_MAX_LENGTH
    ? `${collapsed.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

function toReality(
  record: NylasRecord,
  customerByEmail: Map<string, { id: string; name: string }>,
  timezone: string
): MailMessageReality {
  const from = firstParticipant(record, "from");
  const matched = from.email
    ? customerByEmail.get(from.email.toLowerCase())
    : undefined;

  const subject = typeof record.subject === "string" ? record.subject : null;
  const snippet = typeof record.snippet === "string" ? record.snippet : null;
  const date =
    typeof record.date === "number"
      ? new Date(record.date * 1000).toISOString()
      : null;

  const subtitle =
    [
      nonEmpty(from.name) ?? nonEmpty(from.email),
      date ? formatDisplayDate(date, timezone) : null,
      shortPreview(snippet)
    ]
      .filter((part): part is string => part !== null)
      .join(" · ") || null;

  return {
    id: typeof record.id === "string" ? record.id : "",
    title: nonEmpty(subject) ?? MISSING_SUBJECT_TITLE,
    subtitle,
    subject,
    fromEmail: from.email,
    fromName: from.name,
    date,
    snippet,
    unread: typeof record.unread === "boolean" ? record.unread : null,
    matchedCustomerId: matched?.id ?? null,
    matchedCustomerName: matched?.name ?? null
  };
}

/**
 * Read-only mailbox search over the organization's connected Nylas grant.
 * Deterministically links each message's sender to a real Customer row
 * by exact email match — never an LLM guess. Returns connected:false
 * (not an error) when no Nylas grant is connected yet.
 */
export async function searchMail(
  input: {
    actorUserId: string;
    organizationId: string;
    query?: string;
    anyEmail?: string;
    unread?: boolean;
    limit?: number;
    timezone?: string;
  },
  fetchImpl?: FetchLike
): Promise<MailSearchReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  const connection = await loadNylasConnection(organizationId);

  if (!connection) {
    return { connected: false, connectedEmail: null, messages: [] };
  }

  const fetched = await nylasListMessages(
    {
      grantId: connection.grantId,
      query: {
        query: input.query,
        anyEmail: input.anyEmail,
        unread: input.unread,
        limit: input.limit
      }
    },
    fetchImpl
  );

  // The provider request already carries `limit`; slicing here makes the
  // explicit cap a guarantee of this function rather than of the
  // provider's behaviour. Nylas returns newest-first, so the slice keeps
  // the most recent messages.
  const records =
    input.limit !== undefined ? fetched.slice(0, input.limit) : fetched;

  const candidateEmails = Array.from(
    new Set(
      records
        .map(record => firstParticipant(record, "from").email)
        .filter((email): email is string => email !== null)
    )
  );

  const customers = candidateEmails.length
    ? await db.customer.findMany({
        where: {
          organizationId,
          email: { in: candidateEmails, mode: "insensitive" }
        },
        select: { id: true, name: true, email: true }
      })
    : [];

  const customerByEmail = new Map(
    customers
      .filter(
        (customer): customer is { id: string; name: string; email: string } =>
          customer.email !== null
      )
      .map(customer => [
        customer.email.toLowerCase(),
        { id: customer.id, name: customer.name }
      ])
  );

  return {
    connected: true,
    connectedEmail: connection.email,
    messages: records.map(record =>
      toReality(record, customerByEmail, input.timezone ?? "UTC")
    )
  };
}
