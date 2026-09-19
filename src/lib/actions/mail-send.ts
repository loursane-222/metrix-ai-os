import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";
import {
  MissingNylasCredentialsError,
  NylasRequestError,
  nylasGetMessage,
  nylasSendMessage,
  type FetchLike,
  type NylasRecord
} from "../integrations/nylas/nylas-client";

const MailSendInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    // A plain send names its recipient and subject. A reply names the real
    // provider message it answers instead; recipient and subject are then
    // derived from that message (see resolveReplyTarget), never trusted
    // from the caller.
    to: z.string().trim().email().optional(),
    subject: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(20_000),
    replyToMessageId: z.string().trim().min(1).max(256).optional()
  })
  .refine(
    value => value.replyToMessageId !== undefined || (value.to && value.subject),
    { message: "to and subject are required unless replyToMessageId is given" }
  );

export type MailSendInput = z.input<typeof MailSendInputSchema>;

type ParsedInput = Omit<z.output<typeof MailSendInputSchema>, "to" | "subject"> & {
  to: string;
  subject: string;
};

export type VerifiedMailSendResult = {
  action: "mail.send";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  message: {
    to: string;
    subject: string;
  };
};

export type MailSendUnverifiedReason =
  | "SEND_IN_FLIGHT_OR_UNKNOWN"
  | "SEND_OUTCOME_UNKNOWN"
  | "NO_PROVIDER_MESSAGE_ID"
  | "READBACK_FAILED"
  | "READBACK_MISMATCH";

export class MailSendIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "MailSendIdempotencyConflictError";
  }
}

export class MailReplyTargetNotFoundError extends Error {
  readonly code = "MAIL_REPLY_TARGET_NOT_FOUND";

  constructor() {
    super(
      "The message to reply to was not found in this organization's mailbox " +
        "or has no reply address. Open the message again (mail_search / " +
        "mail_read) instead of guessing a recipient."
    );
    this.name = "MailReplyTargetNotFoundError";
  }
}

export class NylasNotConnectedError extends Error {
  readonly code = "NYLAS_NOT_CONNECTED";

  constructor() {
    super("No connected mailbox for this organization");
    this.name = "NylasNotConnectedError";
  }
}

/**
 * The provider may have accepted (or may still be processing) this send,
 * but METRIX could not prove it. Never a success: the message text is what
 * the model reads as the tool result, so it says outright not to resend.
 */
export class MailSendUnverifiedError extends Error {
  readonly code = "MAIL_SEND_UNVERIFIED";
  readonly reason: MailSendUnverifiedReason;

  constructor(reason: MailSendUnverifiedReason) {
    super(
      `Mail send is NOT verified (${reason}). The email may or may not have ` +
        "been sent. Do not send it again automatically; tell the user the " +
        "send could not be verified."
    );
    this.name = "MailSendUnverifiedError";
    this.reason = reason;
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    to: input.to,
    subject: input.subject,
    body: input.body,
    // Only present for a reply, so the identity of every plain send is
    // exactly what it was before replies existed.
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {})
  });

  return createHash("sha256").update(canonical).digest("hex");
}

// A PENDING claim row whose resourceId is still this sentinel has no
// provider message id yet. resourceId only ever holds a real provider
// message id — never the idempotency key.
const NO_PROVIDER_MESSAGE_ID = "";

const READBACK_ATTEMPTS = 3;
const READBACK_BACKOFF_MS = 500;

export type MailSendOptions = {
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * True only when the provider provably did not process the request: the
 * call never left (missing credentials) or came back as a 4xx refusal.
 * A timeout, a network error, a 5xx or an unreadable 2xx is NOT provable
 * either way, so it is never in this set.
 */
function providerDidNotSend(error: unknown): boolean {
  if (error instanceof MissingNylasCredentialsError) return true;

  return (
    error instanceof NylasRequestError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  );
}

function recipientMatches(message: NylasRecord, to: string): boolean {
  const recipients = Array.isArray(message.to) ? message.to : [];

  return recipients.some(recipient => {
    if (typeof recipient !== "object" || recipient === null) return false;

    const email = (recipient as { email?: unknown }).email;

    return (
      typeof email === "string" &&
      email.trim().toLowerCase() === to.toLowerCase()
    );
  });
}

/**
 * Reads the sent message back from the provider (same grant) and checks
 * id, recipient and subject. The body is intentionally not compared — the
 * provider is free to transform it. A read that fails (e.g. the message
 * is not visible yet) is retried a couple of times; a message that IS
 * readable but does not match is final.
 */
async function verifySentMessage(
  input: {
    grantId: string;
    messageId: string;
    to: string;
    subject: string;
  },
  fetchImpl: FetchLike | undefined,
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  for (let attempt = 1; attempt <= READBACK_ATTEMPTS; attempt += 1) {
    let message: NylasRecord | undefined;

    try {
      message = await nylasGetMessage(
        { grantId: input.grantId, messageId: input.messageId },
        fetchImpl
      );
    } catch {
      message = undefined;
    }

    if (message !== undefined && Object.keys(message).length > 0) {
      const subject =
        typeof message.subject === "string" ? message.subject.trim() : null;

      if (
        message.id === input.messageId &&
        recipientMatches(message, input.to) &&
        subject === input.subject
      ) {
        return;
      }

      throw new MailSendUnverifiedError("READBACK_MISMATCH");
    }

    if (attempt < READBACK_ATTEMPTS) {
      await sleep(READBACK_BACKOFF_MS * attempt);
    }
  }

  throw new MailSendUnverifiedError("READBACK_FAILED");
}

function firstEmail(message: NylasRecord, key: string): string | null {
  const list = Array.isArray(message[key]) ? (message[key] as unknown[]) : [];

  for (const item of list) {
    const email =
      typeof item === "object" && item !== null
        ? (item as { email?: unknown }).email
        : undefined;

    if (typeof email === "string" && email.trim().length > 0) return email.trim();
  }

  return null;
}

/**
 * A reply's recipient and subject come from the REAL message being answered,
 * read with this organization's own grant — a message that is not in this
 * mailbox cannot be replied to. The sender's Reply-To wins, then From; when
 * the mailbox owner wrote that message themselves, "reply" goes to its
 * first recipient. Runs before any ledger claim: a failed read has sent
 * nothing.
 */
async function resolveReplyTarget(
  input: z.output<typeof MailSendInputSchema>,
  fetchImpl: FetchLike | undefined
): Promise<ParsedInput> {
  if (!input.replyToMessageId) {
    return input as ParsedInput;
  }

  const connection = await loadNylasConnection(input.organizationId);

  if (!connection) {
    throw new NylasNotConnectedError();
  }

  let original: NylasRecord;

  try {
    original = await nylasGetMessage(
      { grantId: connection.grantId, messageId: input.replyToMessageId },
      fetchImpl
    );
  } catch (error) {
    if (error instanceof NylasRequestError && error.status === 404) {
      throw new MailReplyTargetNotFoundError();
    }

    throw error;
  }

  if (original.id !== input.replyToMessageId) {
    throw new MailReplyTargetNotFoundError();
  }

  const own = connection.email?.trim().toLowerCase() ?? null;
  const sender = firstEmail(original, "reply_to") ?? firstEmail(original, "from");
  const to =
    sender && sender.toLowerCase() === own ? firstEmail(original, "to") : sender;

  if (!to || !z.string().email().safeParse(to).success) {
    throw new MailReplyTargetNotFoundError();
  }

  const originalSubject =
    typeof original.subject === "string" ? original.subject.trim() : "";
  const subject = /^(re|ynt)\s*:/i.test(originalSubject)
    ? originalSubject
    : `Re: ${originalSubject}`.trim();

  return { ...input, to, subject: subject.slice(0, 500) };
}

function uniqueKey(input: ParsedInput) {
  return {
    organizationId_actionType_idempotencyKey: {
      organizationId: input.organizationId,
      actionType: "mail.send",
      idempotencyKey: input.idempotencyKey
    }
  };
}

function verifiedResult(
  input: ParsedInput,
  replayed: boolean
): VerifiedMailSendResult {
  return {
    action: "mail.send",
    status: "VERIFIED",
    verified: true,
    replayed,
    message: { to: input.to, subject: input.subject }
  };
}

async function markVerified(input: ParsedInput): Promise<void> {
  await db.actionExecution.update({
    where: uniqueKey(input),
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });
}

/**
 * The ledger row already exists for this idempotency key. It is only ever
 * answered from the ledger — this path can never call the provider's send:
 *  - VERIFIED            → replay the verified result.
 *  - PENDING, message id → the send was accepted earlier but readback never
 *                          finished; finish that (a read), then verify.
 *  - PENDING, no id      → another execution is sending right now, or one
 *                          was cut off mid-send. Outcome unknown: fail safe.
 */
async function resolveExisting(
  input: ParsedInput,
  hash: string,
  fetchImpl: FetchLike | undefined,
  sleep: (ms: number) => Promise<void>
): Promise<VerifiedMailSendResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: uniqueKey(input)
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new MailSendIdempotencyConflictError();
  }

  if (existing.status === "VERIFIED") {
    return verifiedResult(input, true);
  }

  if (existing.resourceId === NO_PROVIDER_MESSAGE_ID) {
    throw new MailSendUnverifiedError("SEND_IN_FLIGHT_OR_UNKNOWN");
  }

  const connection = await loadNylasConnection(input.organizationId);

  if (!connection) {
    throw new NylasNotConnectedError();
  }

  await verifySentMessage(
    {
      grantId: connection.grantId,
      messageId: existing.resourceId,
      to: input.to,
      subject: input.subject
    },
    fetchImpl,
    sleep
  );

  await markVerified(input);

  return verifiedResult(input, true);
}

/**
 * Sends one email through the organization's connected mailbox.
 *
 * request → idempotency lookup → atomic PENDING claim → provider send →
 * real provider message id → readback of that message → VERIFIED.
 *
 * The (organizationId, actionType, idempotencyKey) unique constraint is the
 * atomic guard: only the execution whose PENDING insert wins may call the
 * provider, so identical concurrent executions send once. Anything after
 * the send that cannot be proven — timeout, network error, 5xx, missing
 * message id, failed or mismatched readback — leaves the claim PENDING and
 * throws MailSendUnverifiedError; the key is never released, so nothing
 * resends blindly. The only claim that is released is one the provider
 * provably refused (see providerDidNotSend).
 */
export async function executeMailSend(
  rawInput: MailSendInput,
  fetchImpl?: FetchLike,
  options: MailSendOptions = {}
): Promise<VerifiedMailSendResult> {
  const parsed = MailSendInputSchema.parse(rawInput);
  const sleep = options.sleep ?? realSleep;

  await requireOrganizationAccess({
    userId: parsed.actorUserId,
    organizationId: parsed.organizationId
  });

  const input = await resolveReplyTarget(parsed, fetchImpl);

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash, fetchImpl, sleep);

  if (existing) return existing;

  const connection = await loadNylasConnection(input.organizationId);

  if (!connection) {
    throw new NylasNotConnectedError();
  }

  let claimId: string;

  try {
    const claim = await db.actionExecution.create({
      data: {
        organizationId: input.organizationId,
        actionType: "mail.send",
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        resourceType: "NylasMessage",
        resourceId: NO_PROVIDER_MESSAGE_ID,
        status: "PENDING"
      }
    });

    claimId = claim.id;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;

    // Lost the claim race: someone else owns this send. Never send here.
    const raced = await resolveExisting(input, hash, fetchImpl, sleep);

    if (!raced) throw error;

    return raced;
  }

  let sent: NylasRecord;

  try {
    sent = await nylasSendMessage(
      {
        grantId: connection.grantId,
        to: input.to,
        subject: input.subject,
        body: input.body,
        replyToMessageId: input.replyToMessageId
      },
      fetchImpl
    );
  } catch (error) {
    if (providerDidNotSend(error)) {
      await db.actionExecution.deleteMany({
        where: {
          id: claimId,
          status: "PENDING",
          resourceId: NO_PROVIDER_MESSAGE_ID
        }
      });

      throw error;
    }

    throw new MailSendUnverifiedError("SEND_OUTCOME_UNKNOWN");
  }

  const messageId =
    typeof sent.id === "string" && sent.id.trim().length > 0
      ? sent.id.trim()
      : null;

  if (!messageId) {
    throw new MailSendUnverifiedError("NO_PROVIDER_MESSAGE_ID");
  }

  // Keep the provider's id on the still-PENDING claim so a cut-off before
  // readback can be finished later as a read, never as a second send.
  await db.actionExecution.updateMany({
    where: { id: claimId, status: "PENDING" },
    data: { resourceId: messageId }
  });

  await verifySentMessage(
    {
      grantId: connection.grantId,
      messageId,
      to: input.to,
      subject: input.subject
    },
    fetchImpl,
    sleep
  );

  await markVerified(input);

  return verifiedResult(input, false);
}
