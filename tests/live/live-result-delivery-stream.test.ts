import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import { db } from "../../src/lib/db";

import {
  hashSessionToken
} from "../../src/lib/auth/executive-session-context";

import {
  bindOpenAiLiveSession,
  createLiveSessionBinding,
  publishLiveSessionTurnResult
} from "../../src/lib/live/live-session-store";

import { createTurnResult } from "../../src/lib/agent/turn-result";
import type { ListView } from "../../src/lib/presentation/contracts";

// End-to-end proof of the actual transport the browser relies on: a real
// authenticated GET to the result route returns a live text/event-stream
// response, whose first event is the current durable state and whose later
// events are the route's own short-interval re-read of that same durable
// row, deduped by version — never an in-process notification. This is the
// behavior the browser's EventSource actually depends on, not an
// implementation detail of how it gets there.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const organizationId = `live-stream-org-${suffix}`;
const outsiderOrganizationId = `live-stream-outsider-org-${suffix}`;
const userId = `live-stream-user-${suffix}`;
const outsiderUserId = `live-stream-outsider-user-${suffix}`;
const sessionToken = `live-stream-session-${suffix}`;
const outsiderSessionToken = `live-stream-outsider-session-${suffix}`;

function customerListView(label: string): ListView {
  return {
    type: "LIST",
    title: "Müşteriler",
    metrics: [{ label: "Kayıt", value: "1" }],
    rows: [{ id: label, primary: label, raw: { name: label } }]
  };
}

function taskListView(label: string): ListView {
  return {
    type: "LIST",
    title: "Görevler",
    metrics: [{ label: "Kayıt", value: "1" }],
    rows: [{ id: label, primary: label, raw: { title: label } }]
  };
}

type ParsedEvent = { ok: boolean; version: number; turnResult: unknown };

/**
 * Wraps a raw SSE response body with a `next()` that resolves with the
 * next decoded `data: ...` event, silently skipping heartbeat comment
 * lines — the same framing an EventSource parses, read by hand since
 * this test drives the route handler directly rather than through a
 * browser.
 */
function createSseEventReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function next(): Promise<ParsedEvent> {
    for (;;) {
      const separatorIndex = buffer.indexOf("\n\n");

      if (separatorIndex !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        if (rawMessage.startsWith("data: ")) {
          return JSON.parse(rawMessage.slice("data: ".length));
        }

        continue;
      }

      const { value, done } = await reader.read();

      if (done) {
        throw new Error("stream ended before an event arrived");
      }

      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function cancel(): Promise<void> {
    await reader.cancel().catch(() => undefined);
  }

  return { next, cancel };
}

async function seedActor(input: {
  orgId: string;
  actorUserId: string;
  token: string;
}): Promise<void> {
  await db.organization.create({
    data: { id: input.orgId, name: `Org ${input.orgId}` }
  });

  await db.user.create({
    data: { id: input.actorUserId, email: `${input.actorUserId}@example.test` }
  });

  await db.organizationMember.create({
    data: { organizationId: input.orgId, userId: input.actorUserId, role: "OWNER" }
  });

  await db.session.create({
    data: {
      userId: input.actorUserId,
      tokenHash: hashSessionToken(input.token),
      rememberMe: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });
}

async function bootstrapConnectedBinding(
  actorUserId: string,
  orgId: string,
  openAiSessionId: string
) {
  const created = await createLiveSessionBinding({
    actorUserId,
    organizationId: orgId
  });

  return bindOpenAiLiveSession({ bindingId: created.id, openAiSessionId });
}

describe("live result delivery stream (SSE)", () => {
  it(
    "sends the current state first, then pushes each newer publish in order — customer then task, in the same session",
    async () => {
      await seedActor({ orgId: organizationId, actorUserId: userId, token: sessionToken });

      const binding = await bootstrapConnectedBinding(
        userId,
        organizationId,
        `live-stream-session-${suffix}`
      );

      const { GET } = await import(
        "../../src/app/api/metrix/live/session/[bindingId]/result/route"
      );

      const controller = new AbortController();

      const request = new Request(
        `http://localhost/api/metrix/live/session/${binding.id}/result`,
        {
          headers: { cookie: `metrix_session=${sessionToken}` },
          signal: controller.signal
        }
      );

      const response = await GET(request, {
        params: Promise.resolve({ bindingId: binding.id })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.body).not.toBeNull();

      const sse = createSseEventReader(
        response.body as ReadableStream<Uint8Array>
      );

      const initial = await sse.next();

      expect(initial).toEqual({ ok: true, version: 0, turnResult: null });

      const published1 = await publishLiveSessionTurnResult({
        bindingId: binding.id,
        turnResult: createTurnResult({
          executiveText: "",
          presentations: [customerListView("Belgin Tekstil")]
        })
      });

      expect(published1.version).toBe(1);

      const afterCustomer = await sse.next();

      expect(afterCustomer.ok).toBe(true);
      expect(afterCustomer.version).toBe(1);
      expect(afterCustomer.turnResult).toMatchObject({
        presentations: [{ type: "LIST", title: "Müşteriler" }]
      });

      const published2 = await publishLiveSessionTurnResult({
        bindingId: binding.id,
        turnResult: createTurnResult({
          executiveText: "",
          presentations: [taskListView("Stok sayımı")]
        })
      });

      expect(published2.version).toBe(2);

      const afterTask = await sse.next();

      expect(afterTask.ok).toBe(true);
      expect(afterTask.version).toBe(2);
      expect(afterTask.turnResult).toMatchObject({
        presentations: [{ type: "LIST", title: "Görevler" }]
      });

      controller.abort();
      await sse.cancel();
    }
  );

  it(
    "sends the already-published result as the first event to a stream opened after delivery",
    async () => {
      const lateOrgId = `${organizationId}-late`;
      const lateUserId = `${userId}-late`;
      const lateToken = `${sessionToken}-late`;

      await seedActor({ orgId: lateOrgId, actorUserId: lateUserId, token: lateToken });

      const binding = await bootstrapConnectedBinding(
        lateUserId,
        lateOrgId,
        `live-stream-late-session-${suffix}`
      );

      await publishLiveSessionTurnResult({
        bindingId: binding.id,
        turnResult: createTurnResult({
          executiveText: "",
          presentations: [customerListView("Already Here A.Ş.")]
        })
      });

      const { GET } = await import(
        "../../src/app/api/metrix/live/session/[bindingId]/result/route"
      );

      const controller = new AbortController();

      const response = await GET(
        new Request(
          `http://localhost/api/metrix/live/session/${binding.id}/result`,
          {
            headers: { cookie: `metrix_session=${lateToken}` },
            signal: controller.signal
          }
        ),
        { params: Promise.resolve({ bindingId: binding.id }) }
      );

      expect(response.status).toBe(200);

      const sse = createSseEventReader(
        response.body as ReadableStream<Uint8Array>
      );

      const firstEvent = await sse.next();

      expect(firstEvent.version).toBe(1);
      expect(firstEvent.turnResult).toMatchObject({
        presentations: [{ type: "LIST", title: "Müşteriler" }]
      });

      controller.abort();
      await sse.cancel();
    }
  );

  it(
    "recovers the latest durable version on reconnect with zero new events published while disconnected",
    async () => {
      const reconnectOrgId = `${organizationId}-reconnect`;
      const reconnectUserId = `${userId}-reconnect`;
      const reconnectToken = `${sessionToken}-reconnect`;

      await seedActor({
        orgId: reconnectOrgId,
        actorUserId: reconnectUserId,
        token: reconnectToken
      });

      const binding = await bootstrapConnectedBinding(
        reconnectUserId,
        reconnectOrgId,
        `live-stream-reconnect-session-${suffix}`
      );

      const { GET } = await import(
        "../../src/app/api/metrix/live/session/[bindingId]/result/route"
      );

      const requestFor = () =>
        new Request(
          `http://localhost/api/metrix/live/session/${binding.id}/result`,
          { headers: { cookie: `metrix_session=${reconnectToken}` } }
        );

      // First connection: opens, sees nothing published yet, then
      // disconnects entirely (its ReadableStream is cancelled/torn down —
      // any in-process listener it might have held is gone).
      const firstResponse = await GET(requestFor(), {
        params: Promise.resolve({ bindingId: binding.id })
      });

      const firstSse = createSseEventReader(
        firstResponse.body as ReadableStream<Uint8Array>
      );

      expect(await firstSse.next()).toEqual({
        ok: true,
        version: 0,
        turnResult: null
      });

      await firstSse.cancel();

      // Result is published while NO stream is open for this binding at
      // all — nothing could have received an in-process notification even
      // if one existed.
      const published = await publishLiveSessionTurnResult({
        bindingId: binding.id,
        turnResult: createTurnResult({
          executiveText: "",
          presentations: [customerListView("Reconnect Recovery A.Ş.")]
        })
      });

      expect(published.version).toBe(1);

      // A brand-new connection, from scratch — recovers the latest
      // durable version as its very first event, with no dependency on
      // whatever the first connection did or didn't receive.
      const secondResponse = await GET(requestFor(), {
        params: Promise.resolve({ bindingId: binding.id })
      });

      const secondSse = createSseEventReader(
        secondResponse.body as ReadableStream<Uint8Array>
      );

      const recovered = await secondSse.next();

      expect(recovered.version).toBe(1);

      const recoveredTurnResult = recovered.turnResult as {
        presentations: { type: string; title: string; rows: { primary: string }[] }[];
      } | null;

      expect(recoveredTurnResult?.presentations[0]).toMatchObject({
        type: "LIST",
        title: "Müşteriler"
      });

      expect(
        recoveredTurnResult?.presentations[0]?.rows.some(
          (row) => row.primary === "Reconnect Recovery A.Ş."
        )
      ).toBe(true);

      await secondSse.cancel();
    }
  );

  it(
    "refuses another organization's/user's stream with a normal JSON error, never opening the connection",
    async () => {
      await seedActor({
        orgId: outsiderOrganizationId,
        actorUserId: outsiderUserId,
        token: outsiderSessionToken
      });

      const binding = await bootstrapConnectedBinding(
        userId,
        organizationId,
        `live-stream-isolation-session-${suffix}`
      );

      const { GET } = await import(
        "../../src/app/api/metrix/live/session/[bindingId]/result/route"
      );

      const response = await GET(
        new Request(
          `http://localhost/api/metrix/live/session/${binding.id}/result`,
          { headers: { cookie: `metrix_session=${outsiderSessionToken}` } }
        ),
        { params: Promise.resolve({ bindingId: binding.id }) }
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({
        ok: false,
        code: "LIVE_SESSION_ACCESS_DENIED"
      });
    }
  );

  it(
    "rejects an unauthenticated stream request without touching the binding",
    async () => {
      const binding = await bootstrapConnectedBinding(
        userId,
        organizationId,
        `live-stream-unauth-session-${suffix}`
      );

      const { GET } = await import(
        "../../src/app/api/metrix/live/session/[bindingId]/result/route"
      );

      const response = await GET(
        new Request(
          `http://localhost/api/metrix/live/session/${binding.id}/result`
        ),
        { params: Promise.resolve({ bindingId: binding.id }) }
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        code: "UNAUTHENTICATED"
      });
    }
  );
});

afterAll(async () => {
  const allOrgIds = [
    organizationId,
    outsiderOrganizationId,
    `${organizationId}-late`,
    `${organizationId}-reconnect`
  ];

  const allUserIds = [
    userId,
    outsiderUserId,
    `${userId}-late`,
    `${userId}-reconnect`
  ];

  await db.liveSession.deleteMany({
    where: { organizationId: { in: allOrgIds } }
  });

  await db.organizationMember.deleteMany({
    where: { organizationId: { in: allOrgIds } }
  });

  await db.session.deleteMany({
    where: { userId: { in: allUserIds } }
  });

  await db.user.deleteMany({
    where: { id: { in: allUserIds } }
  });

  await db.organization.deleteMany({
    where: { id: { in: allOrgIds } }
  });

  await db.$disconnect();
});
