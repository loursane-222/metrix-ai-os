// Deterministic in-memory Nylas mailbox keyed by grant id, used through an
// injected FetchLike — no test using it can reach a real provider. A grant
// only ever sees ITS OWN messages, which is exactly how the real provider
// isolates one organization's mailbox from another's.

import type { FetchLike } from "../../src/lib/integrations/nylas/nylas-client";

import { fakeResponse } from "./fake-nylas";

export type FakeMailMessage = Record<string, unknown> & { id: string };

export function createFakeMailbox(
  mailboxes: Record<string, FakeMailMessage[]>,
  options: {
    failThreadList?: boolean;
    failListFor?: string[];
    sendId?: string;
  } = {}
) {
  const requests: Array<{ method: string; url: string; grantId: string; body?: unknown }> = [];
  const sent: Array<{ grantId: string; payload: Record<string, unknown> }> = [];

  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const parsed = new URL(url);
    const grantMatch = /\/v3\/grants\/([^/]+)\/messages(?:\/([^/]+))?$/.exec(parsed.pathname);

    if (!grantMatch) throw new Error(`fake-mailbox: unexpected request ${method} ${url}`);

    const grantId = decodeURIComponent(grantMatch[1]!);
    const tail = grantMatch[2] ? decodeURIComponent(grantMatch[2]) : undefined;
    const messages = mailboxes[grantId] ?? [];

    requests.push({
      method,
      url,
      grantId,
      body: init?.body ? JSON.parse(init.body) : undefined
    });

    if (method === "POST" && tail === "send") {
      const payload = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      const id = options.sendId ?? `sent-${sent.length + 1}`;
      sent.push({ grantId, payload });
      (mailboxes[grantId] ??= []).push({
        id,
        subject: payload.subject,
        to: payload.to,
        from: [{ email: "owner@example.test" }],
        date: Math.floor(Date.now() / 1000)
      });

      return fakeResponse(200, { request_id: "req", data: { id } });
    }

    if (method === "GET" && tail) {
      const found = messages.find(message => message.id === tail);

      return found
        ? fakeResponse(200, { request_id: "req", data: found })
        : fakeResponse(404, { error: { type: "not_found" } });
    }

    if (method === "GET") {
      const params = parsed.searchParams;

      if (options.failListFor?.includes(grantId)) return fakeResponse(500, {});
      if (params.get("thread_id") && options.failThreadList) return fakeResponse(500, {});

      const filtered = messages.filter(message => {
        if (params.get("thread_id") && message.thread_id !== params.get("thread_id")) return false;
        if (params.get("unread") === "true" && message.unread !== true) return false;
        if (params.get("in") && !((message.folders as string[] | undefined) ?? []).includes(params.get("in")!)) return false;

        const after = params.get("received_after");
        if (after && (message.date as number) <= Number(after)) return false;

        return true;
      });

      return fakeResponse(200, { request_id: "req", data: filtered });
    }

    throw new Error(`fake-mailbox: unexpected request ${method} ${url}`);
  };

  return { fetchImpl, requests, sent };
}
