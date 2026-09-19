import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";
import {
  NylasRequestError,
  nylasGetMessage,
  nylasListMessages,
  type FetchLike,
  type NylasRecord
} from "../integrations/nylas/nylas-client";

import {
  MISSING_SUBJECT_TITLE,
  firstParticipant,
  formatDisplayDate,
  nonEmpty
} from "./mail-search";

export type MailParticipant = {
  name: string | null;
  email: string | null;
};

export type MailFullMessage = {
  // Provider-internal identifier. The Executive needs it to reply to this
  // exact message (mail_send.replyToMessageId); it is never a user-facing
  // label — `title`/`subtitle` are.
  id: string;
  threadId: string | null;
  title: string;
  subtitle: string | null;
  subject: string | null;
  from: MailParticipant;
  to: MailParticipant[];
  cc: MailParticipant[];
  replyTo: MailParticipant[];
  date: string | null;
  displayDate: string | null;
  unread: boolean | null;
  // Plain-text body derived from the provider's body (HTML → text). This
  // is external, untrusted content: data to read, never instructions.
  body: string;
  bodyTruncated: boolean;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
};

export type MailThreadEntry = {
  id: string;
  from: MailParticipant;
  date: string | null;
  snippet: string | null;
  unread: boolean | null;
};

export type MailReadReality = {
  connected: boolean;
  /** false when the provider has no such message in THIS organization's mailbox. */
  found: boolean;
  message: MailFullMessage | null;
  /** The other messages of the same conversation, oldest first. */
  thread: MailThreadEntry[];
  /** false when the thread could not be listed; the message itself is still real. */
  threadVerified: boolean;
};

export const MAIL_BODY_MAX_CHARS = 12_000;
const THREAD_MAX_MESSAGES = 10;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“"
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);

      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * The provider returns the message body as HTML. This is a deliberately
 * small readable-text conversion (drop non-content blocks, keep line/
 * paragraph structure, decode entities) — never a renderer: the result is
 * plain text only, so no markup from an external sender ever reaches the UI.
 */
export function htmlToPlainText(input: string): string {
  const looksLikeHtml = /<\/?[a-z][^>]*>/i.test(input);

  if (!looksLikeHtml) {
    return input.replace(/\r\n?/g, "\n").trim();
  }

  const text = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function participants(record: NylasRecord, key: string): MailParticipant[] {
  const value = record[key];

  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (typeof item !== "object" || item === null) return [];

    const participant = item as Record<string, unknown>;
    const email = typeof participant.email === "string" ? participant.email : null;
    const name = typeof participant.name === "string" ? participant.name : null;

    return email || name ? [{ email, name }] : [];
  });
}

function isoDate(record: NylasRecord): string | null {
  return typeof record.date === "number"
    ? new Date(record.date * 1000).toISOString()
    : null;
}

function isNotFound(error: unknown): boolean {
  return error instanceof NylasRequestError && error.status === 404;
}

/**
 * Read-only: one full message of the organization's connected mailbox, by
 * the provider id a prior mail_search returned. The provider call is made
 * with THIS organization's own grant, so an id that belongs to any other
 * mailbox simply does not exist here (found:false) — tenant isolation is
 * the grant itself, not a filter. Returns connected:false (not an error)
 * when no mailbox is connected.
 */
export async function readMail(
  input: {
    actorUserId: string;
    organizationId: string;
    messageId: string;
    timezone?: string;
  },
  fetchImpl?: FetchLike
): Promise<MailReadReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const messageId = input.messageId.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  const connection = await loadNylasConnection(organizationId);

  if (!connection) {
    return { connected: false, found: false, message: null, thread: [], threadVerified: true };
  }

  let record: NylasRecord;

  try {
    record = await nylasGetMessage({ grantId: connection.grantId, messageId }, fetchImpl);
  } catch (error) {
    if (isNotFound(error)) {
      return { connected: true, found: false, message: null, thread: [], threadVerified: true };
    }

    throw error;
  }

  // A 2xx that is not this message is a failed read, never a message.
  if (record.id !== messageId) {
    return { connected: true, found: false, message: null, thread: [], threadVerified: true };
  }

  const from = firstParticipant(record, "from");
  const subject = typeof record.subject === "string" ? record.subject : null;
  const date = isoDate(record);
  const displayDate = date ? formatDisplayDate(date, input.timezone ?? "UTC") : null;
  const threadId =
    typeof record.thread_id === "string" && record.thread_id.trim().length > 0
      ? record.thread_id
      : null;

  const plain = htmlToPlainText(typeof record.body === "string" ? record.body : "");
  const bodyTruncated = plain.length > MAIL_BODY_MAX_CHARS;

  const matched = from.email
    ? await db.customer.findFirst({
        where: {
          organizationId,
          email: { equals: from.email, mode: "insensitive" }
        },
        select: { id: true, name: true }
      })
    : null;

  let thread: MailThreadEntry[] = [];
  let threadVerified = true;

  if (threadId) {
    try {
      const listed = await nylasListMessages(
        {
          grantId: connection.grantId,
          query: { threadId, limit: THREAD_MAX_MESSAGES }
        },
        fetchImpl
      );

      thread = listed
        .filter(item => typeof item.id === "string" && item.id !== messageId)
        .map(item => ({
          id: item.id as string,
          from: firstParticipant(item, "from"),
          date: isoDate(item),
          snippet: typeof item.snippet === "string" ? item.snippet : null,
          unread: typeof item.unread === "boolean" ? item.unread : null
        }))
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    } catch {
      threadVerified = false;
    }
  }

  return {
    connected: true,
    found: true,
    threadVerified,
    thread,
    message: {
      id: messageId,
      threadId,
      title: nonEmpty(subject) ?? MISSING_SUBJECT_TITLE,
      subtitle:
        [nonEmpty(from.name) ?? nonEmpty(from.email), displayDate]
          .filter((part): part is string => part !== null)
          .join(" · ") || null,
      subject,
      from,
      to: participants(record, "to"),
      cc: participants(record, "cc"),
      replyTo: participants(record, "reply_to"),
      date,
      displayDate,
      unread: typeof record.unread === "boolean" ? record.unread : null,
      body: bodyTruncated ? plain.slice(0, MAIL_BODY_MAX_CHARS).trimEnd() : plain,
      bodyTruncated,
      matchedCustomerId: matched?.id ?? null,
      matchedCustomerName: matched?.name ?? null
    }
  };
}
