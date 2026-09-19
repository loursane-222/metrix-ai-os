import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MissingNylasCredentialsError,
  NylasRequestError,
  buildNylasHostedAuthUrl,
  NYLAS_REQUEST_TIMEOUT_MS,
  nylasExchangeCodeForGrant,
  nylasGetGrant,
  nylasGetMessage,
  nylasListEvents,
  nylasListMessages,
  nylasSendMessage,
  type FetchLike
} from "../../src/lib/integrations/nylas/nylas-client";

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
});

afterEach(() => {
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
});

function mockFetch(response: { status: number; body: unknown }): {
  fetchImpl: FetchLike;
  calls: Array<{ url: string; init: Parameters<FetchLike>[1] }>;
} {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body
    };
  };

  return { fetchImpl, calls };
}

describe("nylas-client (ported adapter, mocked HTTP)", () => {
  it("throws MissingNylasCredentialsError when NYLAS_CLIENT_ID/NYLAS_API_KEY are unset", async () => {
    delete process.env.NYLAS_CLIENT_ID;
    delete process.env.NYLAS_API_KEY;

    const { fetchImpl } = mockFetch({ status: 200, body: {} });

    expect(() =>
      buildNylasHostedAuthUrl({ redirectUri: "https://app.test/callback" })
    ).toThrow(MissingNylasCredentialsError);

    await expect(
      nylasListMessages({ grantId: "g1" }, fetchImpl)
    ).rejects.toBeInstanceOf(MissingNylasCredentialsError);
  });

  it("builds the documented Hosted Authentication URL with client_id/redirect_uri/response_type", () => {
    const url = buildNylasHostedAuthUrl({
      redirectUri: "https://app.test/callback",
      provider: "google",
      state: "org-123"
    });

    expect(url).toBe(
      "https://api.us.nylas.com/v3/connect/auth?" +
        "client_id=test-client-id&redirect_uri=https%3A%2F%2Fapp.test%2Fcallback" +
        "&response_type=code&access_type=online&provider=google&state=org-123"
    );
  });

  it("exchanges a code for a grant via POST /v3/connect/token", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: { access_token: "at", grant_id: "grant-1" }
    });

    const result = await nylasExchangeCodeForGrant(
      { code: "auth-code", redirectUri: "https://app.test/callback" },
      fetchImpl
    );

    expect(result).toEqual({ grantId: "grant-1" });
    expect(calls[0]?.url).toBe("https://api.us.nylas.com/v3/connect/token");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({
      client_id: "test-client-id",
      client_secret: "test-api-key",
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://app.test/callback"
    });
  });

  it("throws NylasRequestError when the token exchange response has no grant_id", async () => {
    const { fetchImpl } = mockFetch({ status: 200, body: { access_token: "at" } });

    await expect(
      nylasExchangeCodeForGrant(
        { code: "c", redirectUri: "https://app.test/callback" },
        fetchImpl
      )
    ).rejects.toBeInstanceOf(NylasRequestError);
  });

  it("reads grant identity via GET /v3/grants/{grant_id}, unwrapping the data envelope", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: { request_id: "r1", data: { id: "grant-1", email: "u@example.test", provider: "google" } }
    });

    const grant = await nylasGetGrant("grant-1", fetchImpl);

    expect(grant).toEqual({ id: "grant-1", email: "u@example.test", provider: "google" });
    expect(calls[0]?.url).toBe("https://api.us.nylas.com/v3/grants/grant-1");
  });

  it("lists messages with Bearer auth and query filters, unwrapping the data envelope", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: { request_id: "r1", data: [{ id: "m1", subject: "Merhaba" }], next_cursor: null }
    });

    const messages = await nylasListMessages(
      { grantId: "grant-1", query: { anyEmail: "abc@example.test", unread: true, limit: 5 } },
      fetchImpl
    );

    expect(messages).toEqual([{ id: "m1", subject: "Merhaba" }]);

    const call = calls[0]!;
    expect(call.url).toContain("/v3/grants/grant-1/messages?");
    expect(call.url).toContain("any_email=abc%40example.test");
    expect(call.url).toContain("unread=true");
    expect(call.url).toContain("limit=5");
    expect((call.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-api-key"
    );
  });

  it("sends a message via POST /v3/grants/{grant_id}/messages/send", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: { request_id: "r1", data: { id: "sent-1" } }
    });

    const result = await nylasSendMessage(
      { grantId: "grant-1", to: "musteri@example.test", subject: "Teklif", body: "Merhaba" },
      fetchImpl
    );

    expect(result).toEqual({ id: "sent-1" });
    expect(calls[0]?.url).toBe(
      "https://api.us.nylas.com/v3/grants/grant-1/messages/send"
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      to: [{ email: "musteri@example.test" }],
      subject: "Teklif",
      body: "Merhaba"
    });
  });

  it("reads one message back via GET /v3/grants/{grant_id}/messages/{message_id}, unwrapping the data envelope", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: {
        request_id: "r1",
        data: { id: "msg 1", subject: "Teklif", to: [{ email: "musteri@example.test" }] }
      }
    });

    const message = await nylasGetMessage(
      { grantId: "grant-1", messageId: "msg 1" },
      fetchImpl
    );

    expect(message).toEqual({
      id: "msg 1",
      subject: "Teklif",
      to: [{ email: "musteri@example.test" }]
    });
    expect(calls[0]?.url).toBe(
      "https://api.us.nylas.com/v3/grants/grant-1/messages/msg%201"
    );
    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
    expect(calls[0]?.init?.body).toBeUndefined();
  });

  it("bounds every request with a timeout signal and lets a timeout propagate un-wrapped", async () => {
    const { fetchImpl, calls } = mockFetch({ status: 200, body: { data: {} } });

    await nylasGetMessage({ grantId: "grant-1", messageId: "m1" }, fetchImpl);

    const signal = calls[0]?.init?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    expect(NYLAS_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);

    const timingOut: FetchLike = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };

    const error = await nylasSendMessage(
      { grantId: "grant-1", to: "a@example.test", subject: "s", body: "b" },
      timingOut
    ).catch((e: unknown) => e);

    // Not a NylasRequestError: a slow network must never look like the
    // provider refusing (nylas-connect persists ERROR on that).
    expect(error).not.toBeInstanceOf(NylasRequestError);
    expect((error as DOMException).name).toBe("TimeoutError");
  });

  it("lists calendar events defaulting to the primary calendar", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: { request_id: "r1", data: [{ id: "e1", title: "Toplantı" }] }
    });

    const events = await nylasListEvents({ grantId: "grant-1" }, fetchImpl);

    expect(events).toEqual([{ id: "e1", title: "Toplantı" }]);
    expect(calls[0]?.url).toContain("/v3/grants/grant-1/events?");
    expect(calls[0]?.url).toContain("calendar_id=primary");
  });

  it("treats a 2xx /events payload that is not an events array as a failed read, never an empty list", async () => {
    for (const body of [{ data: { unexpected: true } }, {}, null, { request_id: "r1" }]) {
      const { fetchImpl } = mockFetch({ status: 200, body });

      const error = await nylasListEvents({ grantId: "grant-1" }, fetchImpl).catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(NylasRequestError);
      expect((error as NylasRequestError).code).toBe("INVALID_EVENTS_RESPONSE");
    }

    const { fetchImpl } = mockFetch({ status: 200, body: { data: [] } });
    await expect(nylasListEvents({ grantId: "grant-1" }, fetchImpl)).resolves.toEqual([]);
  });

  it("throws NylasRequestError on a non-2xx response", async () => {
    const { fetchImpl } = mockFetch({ status: 401, body: {} });

    await expect(
      nylasListMessages({ grantId: "grant-1" }, fetchImpl)
    ).rejects.toBeInstanceOf(NylasRequestError);
  });

  it("filters out non-object array entries defensively", async () => {
    const { fetchImpl } = mockFetch({
      status: 200,
      body: { data: [{ id: "1" }, "not-an-object", null, 42] }
    });

    const events = await nylasListEvents({ grantId: "grant-1" }, fetchImpl);

    expect(events).toEqual([{ id: "1" }]);
  });
});
