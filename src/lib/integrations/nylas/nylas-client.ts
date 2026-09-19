// Minimal Nylas v3 REST adapter. Ported knowledge only (base URL, Hosted
// Authentication with API key, the /v3/connect/token exchange, and the
// handful of grant-scoped endpoints this operation needs) — verified
// against developer.nylas.com/docs/v3 on 2026-09-18. Full message/event
// object schemas are NOT reproduced in Nylas's own reference beyond a
// handful of documented fields, so response objects are intentionally
// typed as opaque records with defensive field extraction — never trust
// an inferred schema, always verify against a live grant.

const REGION_BASE_URL: Record<string, string> = {
  us: "https://api.us.nylas.com",
  eu: "https://api.eu.nylas.com"
};

export type NylasCredentials = {
  clientId: string;
  apiKey: string;
};

export class MissingNylasCredentialsError extends Error {
  readonly code = "MISSING_NYLAS_CREDENTIALS";

  constructor() {
    super(
      "NYLAS_CLIENT_ID / NYLAS_API_KEY is not configured — a real Nylas " +
        "application is required before any connection can be attempted"
    );
    this.name = "MissingNylasCredentialsError";
  }
}

function requireNylasCredentials(): NylasCredentials {
  const clientId = process.env.NYLAS_CLIENT_ID;
  const apiKey = process.env.NYLAS_API_KEY;

  if (!clientId || clientId.trim().length === 0 || !apiKey || apiKey.trim().length === 0) {
    throw new MissingNylasCredentialsError();
  }

  return { clientId, apiKey };
}

function baseUrl(): string {
  const region = (process.env.NYLAS_API_REGION ?? "us").trim().toLowerCase();
  return REGION_BASE_URL[region] ?? REGION_BASE_URL.us;
}

export type NylasRecord = Record<string, unknown>;

export class NylasRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(`Nylas request failed: ${code}`);
    this.name = "NylasRequestError";
    this.code = code;
    this.status = status;
  }
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Builds the Hosted Authentication redirect URL (GET /v3/connect/auth).
 * No HTTP call — the browser follows this URL directly. Requires
 * NYLAS_CLIENT_ID to already be configured (fails closed otherwise, same
 * as every other function here).
 */
export function buildNylasHostedAuthUrl(input: {
  redirectUri: string;
  provider?: "google" | "microsoft";
  state?: string;
}): string {
  const { clientId } = requireNylasCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "online"
  });

  if (input.provider) {
    params.set("provider", input.provider);
  }

  if (input.state) {
    params.set("state", input.state);
  }

  return `${baseUrl()}/v3/connect/auth?${params.toString()}`;
}

// Bounds every Nylas call (including reading its body). A timeout/abort
// is deliberately NOT wrapped in NylasRequestError: it propagates as the
// native TimeoutError so callers that treat NylasRequestError as "the
// provider refused" (nylas-connect) never mistake a slow network for a
// refusal, and so a mutating caller (mail send) can tell "outcome
// unknown" apart from "provider rejected".
export const NYLAS_REQUEST_TIMEOUT_MS = 15_000;

async function nylasRequest(
  path: string,
  init: { method?: string; body?: unknown } | undefined,
  fetchImpl: FetchLike
): Promise<unknown> {
  const { apiKey } = requireNylasCredentials();

  const response = await fetchImpl(`${baseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    ...(init?.body !== undefined
      ? { body: JSON.stringify(init.body) }
      : {}),
    signal: AbortSignal.timeout(NYLAS_REQUEST_TIMEOUT_MS)
  });

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new NylasRequestError(
      `INVALID_RESPONSE_${response.status}`,
      response.status
    );
  }

  if (!response.ok) {
    throw new NylasRequestError(`HTTP_${response.status}`, response.status);
  }

  return body;
}

function dataField(body: unknown): unknown {
  return typeof body === "object" && body !== null && "data" in body
    ? (body as { data: unknown }).data
    : body;
}

function asRecord(value: unknown): NylasRecord {
  return typeof value === "object" && value !== null
    ? (value as NylasRecord)
    : {};
}

function asRecordArray(value: unknown): NylasRecord[] {
  const data = dataField(value);

  return Array.isArray(data)
    ? data.filter(
        (item): item is NylasRecord =>
          typeof item === "object" && item !== null
      )
    : [];
}

/** Exchanges a Hosted Authentication `code` for a grant (POST /v3/connect/token). */
export async function nylasExchangeCodeForGrant(
  input: { code: string; redirectUri: string },
  fetchImpl: FetchLike = fetch
): Promise<{ grantId: string }> {
  const { clientId, apiKey } = requireNylasCredentials();

  const body = await nylasRequest(
    "/v3/connect/token",
    {
      method: "POST",
      body: {
        client_id: clientId,
        client_secret: apiKey,
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri
      }
    },
    fetchImpl
  );

  const record = asRecord(body);
  const grantId = record.grant_id;

  if (typeof grantId !== "string" || grantId.trim().length === 0) {
    throw new NylasRequestError("MISSING_GRANT_ID");
  }

  return { grantId };
}

/** Reads the connected account's own identity (email/provider) for one grant. */
export async function nylasGetGrant(
  grantId: string,
  fetchImpl: FetchLike = fetch
): Promise<NylasRecord> {
  const body = await nylasRequest(
    `/v3/grants/${encodeURIComponent(grantId)}`,
    undefined,
    fetchImpl
  );

  return asRecord(dataField(body));
}

export type NylasMessageQuery = {
  query?: string;
  subject?: string;
  anyEmail?: string;
  unread?: boolean;
  limit?: number;
  /** Only messages of this thread (message.thread_id). */
  threadId?: string;
  /** Only messages received after this instant (Unix seconds). */
  receivedAfter?: number;
  /** Only messages in this folder/label, e.g. "INBOX". */
  folder?: string;
};

/** GET /v3/grants/{grant_id}/messages — search/list, never mutates. */
export async function nylasListMessages(
  input: { grantId: string; query?: NylasMessageQuery },
  fetchImpl: FetchLike = fetch
): Promise<NylasRecord[]> {
  const params = new URLSearchParams();
  const limit = input.query?.limit ?? 20;
  params.set("limit", String(Math.min(Math.max(limit, 1), 50)));

  if (input.query?.subject) {
    params.set("subject", input.query.subject);
  }

  if (input.query?.anyEmail) {
    params.set("any_email", input.query.anyEmail);
  }

  if (input.query?.unread !== undefined) {
    params.set("unread", String(input.query.unread));
  }

  if (input.query?.query) {
    params.set("search_query_native", input.query.query);
  }

  if (input.query?.threadId) {
    params.set("thread_id", input.query.threadId);
  }

  if (input.query?.receivedAfter !== undefined) {
    params.set("received_after", String(input.query.receivedAfter));
  }

  if (input.query?.folder) {
    params.set("in", input.query.folder);
  }

  const body = await nylasRequest(
    `/v3/grants/${encodeURIComponent(input.grantId)}/messages?${params.toString()}`,
    undefined,
    fetchImpl
  );

  return asRecordArray(body);
}

/** POST /v3/grants/{grant_id}/messages/send — the only mutating call in this client. */
export async function nylasSendMessage(
  input: {
    grantId: string;
    to: string;
    subject: string;
    body: string;
    /** Provider id of the message being answered; threads the reply. */
    replyToMessageId?: string;
  },
  fetchImpl: FetchLike = fetch
): Promise<NylasRecord> {
  const body = await nylasRequest(
    `/v3/grants/${encodeURIComponent(input.grantId)}/messages/send`,
    {
      method: "POST",
      body: {
        to: [{ email: input.to }],
        subject: input.subject,
        body: input.body,
        ...(input.replyToMessageId
          ? { reply_to_message_id: input.replyToMessageId }
          : {})
      }
    },
    fetchImpl
  );

  return asRecord(dataField(body));
}

/** GET /v3/grants/{grant_id}/messages/{message_id} — single-message readback, never mutates. */
export async function nylasGetMessage(
  input: { grantId: string; messageId: string },
  fetchImpl: FetchLike = fetch
): Promise<NylasRecord> {
  const body = await nylasRequest(
    `/v3/grants/${encodeURIComponent(input.grantId)}/messages/${encodeURIComponent(input.messageId)}`,
    undefined,
    fetchImpl
  );

  return asRecord(dataField(body));
}

/**
 * GET /v3/grants/{grant_id}/events — calendarId defaults to "primary",
 * which Nylas resolves to the connected account's own default calendar
 * without a separate calendars lookup. start/end are Unix seconds.
 */
export async function nylasListEvents(
  input: {
    grantId: string;
    calendarId?: string;
    start?: number;
    end?: number;
  },
  fetchImpl: FetchLike = fetch
): Promise<NylasRecord[]> {
  const params = new URLSearchParams({
    calendar_id: input.calendarId ?? "primary",
    limit: "50"
  });

  if (input.start !== undefined) {
    params.set("start", String(input.start));
  }

  if (input.end !== undefined) {
    params.set("end", String(input.end));
  }

  const body = await nylasRequest(
    `/v3/grants/${encodeURIComponent(input.grantId)}/events?${params.toString()}`,
    undefined,
    fetchImpl
  );

  // A 2xx whose payload is not an events array is a failed read, never an
  // empty calendar — asRecordArray alone would turn it into [].
  if (!Array.isArray(dataField(body))) {
    throw new NylasRequestError("INVALID_EVENTS_RESPONSE");
  }

  return asRecordArray(body);
}
