// Deterministic in-memory stand-in for the Nylas REST API used by the mail
// send tests. It is only ever reached through an injected FetchLike or a
// stubbed global fetch — no test using it can contact real Nylas/Gmail.

import type { FetchLike } from "../../src/lib/integrations/nylas/nylas-client";

export type FakeResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export function fakeResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

export type SentPayload = {
  to: Array<{ email: string }>;
  subject: string;
  body: string;
};

export type FakeNylasConfig = {
  /** Holds every send open this long, so concurrent callers overlap. */
  sendDelayMs?: number;
  /** Overrides the POST /messages/send response. */
  send?: (payload: SentPayload) => Promise<FakeResponse>;
  /** Overrides the GET /messages/{id} response. */
  readback?: (ctx: {
    messageId: string;
    sent: SentPayload | undefined;
  }) => Promise<FakeResponse>;
};

export const PROVIDER_MESSAGE_ID = "18f3a9c27d4be105";

export function createFakeNylas(config: FakeNylasConfig = {}) {
  const sends: Array<{ url: string; payload: SentPayload }> = [];
  const gets: string[] = [];
  const urls: string[] = [];
  const sentById = new Map<string, SentPayload>();

  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    urls.push(`${method} ${url}`);

    if (method === "POST" && url.endsWith("/messages/send")) {
      const payload = JSON.parse(init?.body ?? "{}") as SentPayload;
      sends.push({ url, payload });

      if (config.sendDelayMs) {
        await new Promise(resolve => setTimeout(resolve, config.sendDelayMs));
      }

      if (config.send) return config.send(payload);

      sentById.set(PROVIDER_MESSAGE_ID, payload);
      return fakeResponse(200, {
        request_id: "req-fake",
        data: { id: PROVIDER_MESSAGE_ID }
      });
    }

    const readMatch = /\/messages\/([^/?]+)$/.exec(url);

    if (method === "GET" && readMatch) {
      const messageId = decodeURIComponent(readMatch[1]!);
      gets.push(messageId);
      const sent = sentById.get(messageId) ?? sends.at(-1)?.payload;

      if (config.readback) return config.readback({ messageId, sent });

      if (!sentById.has(messageId)) return fakeResponse(404, {});

      return fakeResponse(200, {
        request_id: "req-fake",
        data: {
          id: messageId,
          subject: sent?.subject,
          to: sent?.to,
          folders: ["SENT"]
        }
      });
    }

    throw new Error(`fake-nylas: unexpected request ${method} ${url}`);
  };

  return { fetchImpl, sends, gets, urls, sentById };
}
