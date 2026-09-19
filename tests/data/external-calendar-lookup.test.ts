import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import { OrganizationAccessDeniedError } from "../../src/lib/auth/organization-access";
import { lookupExternalCalendarEvents } from "../../src/lib/data/external-calendar-lookup";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import type { FetchLike } from "../../src/lib/integrations/nylas/nylas-client";

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeAll(() => {
  // Safety net: nothing here may reach the real Nylas/Google Calendar.
  vi.stubGlobal("fetch", async () => {
    throw new Error("real network access is forbidden in calendar lookup tests");
  });
});

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

function recordingFetch(
  respond: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async url => {
    urls.push(url);
    return respond();
  };
  return { fetchImpl, urls };
}

const okBody = (body: unknown) => async () => ({
  ok: true,
  status: 200,
  json: async () => body
});

const httpStatus = (status: number) => async () => ({
  ok: false,
  status,
  json: async () => ({ error: { message: "provider detail that must never surface" } })
});

const createdOrgs: string[] = [];
const createdUsers: string[] = [];

async function createOrg(
  suffix: string,
  options: { connection?: "CONNECTED" | "DISCONNECTED" | null; grantId?: string } = {}
) {
  const organizationId = `ext-cal-org-${suffix}`;
  const userId = `ext-cal-user-${suffix}`;

  await db.organization.create({ data: { id: organizationId, name: "External Calendar Tenant" } });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });

  if (options.connection) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: options.connection,
        credentialsEncrypted: encryptSecret(
          JSON.stringify({
            grantId: options.grantId ?? "grant-1",
            email: "owner@example.test",
            provider: "google"
          })
        )
      }
    });
  }

  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  return { organizationId, actorUserId: userId };
}

function uniqueSuffix(label: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`;
}

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }

  for (const id of createdUsers.splice(0)) {
    await db.user.deleteMany({ where: { id } });
  }
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

describe("external calendar lookup — empty, not connected and failed are different things", () => {
  it("NOT_CONNECTED: no Nylas connection — reported as such, no provider call", async () => {
    const ctx = await createOrg(uniqueSuffix("noconn"));
    const { fetchImpl, urls } = recordingFetch(okBody({ data: [] }));

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read).toEqual({ status: "NOT_CONNECTED", events: [], skippedCount: 0 });
    expect(urls).toEqual([]);
  });

  it("NOT_CONNECTED: a connection that is not CONNECTED is not used", async () => {
    const ctx = await createOrg(uniqueSuffix("disc"), { connection: "DISCONNECTED" });
    const { fetchImpl, urls } = recordingFetch(okBody({ data: [{ id: "x" }] }));

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read.status).toBe("NOT_CONNECTED");
    expect(urls).toEqual([]);
  });

  it("READ_OK with events: timespan, date and datespan are normalized; the request carries the range", async () => {
    const ctx = await createOrg(uniqueSuffix("events"), { connection: "CONNECTED" });
    const { fetchImpl, urls } = recordingFetch(
      okBody({
        data: [
          {
            id: "e1",
            title: "Müşteri Görüşmesi",
            when: { object: "timespan", start_time: 1_726_500_000, end_time: 1_726_503_600 }
          },
          { id: "e2", title: "Fuar", when: { object: "date", date: "2026-09-20" } },
          {
            id: "e3",
            title: "Seyahat",
            when: { object: "datespan", start_date: "2026-09-21", end_date: "2026-09-23" }
          }
        ]
      })
    );

    const read = await lookupExternalCalendarEvents(
      {
        ...ctx,
        endsAfter: "2026-09-18T00:00:00+03:00",
        startsBefore: "2026-09-18T23:59:59+03:00"
      },
      fetchImpl
    );

    expect(read.status).toBe("READ_OK");
    expect(read.skippedCount).toBe(0);
    expect(read.events).toHaveLength(3);
    expect(read.events[0]).toEqual({
      id: "nylas:e1",
      title: "Müşteri Görüşmesi",
      startsAt: new Date(1_726_500_000 * 1000).toISOString(),
      endsAt: new Date(1_726_503_600 * 1000).toISOString(),
      allDay: false
    });
    expect(read.events[1]).toMatchObject({ id: "nylas:e2", title: "Fuar", allDay: true });
    expect(read.events[2]).toMatchObject({
      id: "nylas:e3",
      allDay: true,
      startsAt: "2026-09-21T00:00:00.000Z",
      endsAt: "2026-09-23T00:00:00.000Z"
    });

    // endsAfter → start, startsBefore → end (unix seconds of the exact instants)
    expect(urls[0]).toContain("/v3/grants/grant-1/events?");
    expect(urls[0]).toContain(`start=${Date.parse("2026-09-17T21:00:00Z") / 1000}`);
    expect(urls[0]).toContain(`end=${Date.parse("2026-09-18T20:59:59Z") / 1000}`);
  });

  it("READ_OK with an empty list: a genuinely empty calendar, distinct from every failure", async () => {
    const ctx = await createOrg(uniqueSuffix("empty"), { connection: "CONNECTED" });
    const { fetchImpl } = recordingFetch(okBody({ request_id: "r1", data: [] }));

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read).toEqual({ status: "READ_OK", events: [], skippedCount: 0 });
  });

  it.each([
    ["HTTP 401", httpStatus(401)],
    ["HTTP 403", httpStatus(403)],
    ["HTTP 404", httpStatus(404)],
    ["HTTP 429", httpStatus(429)],
    ["HTTP 500", httpStatus(500)],
    ["HTTP 503", httpStatus(503)],
    [
      "timeout",
      async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
    ],
    [
      "abort",
      async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    ],
    [
      "network failure",
      async () => {
        throw new TypeError("fetch failed");
      }
    ],
    [
      "unreadable 2xx body",
      async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        }
      })
    ],
    ["2xx without an events array", okBody({ request_id: "r1", data: { unexpected: true } })],
    ["2xx with an empty object", okBody({})],
    ["2xx with a null payload", okBody(null)]
  ])("READ_FAILED: %s is a failure, never an empty calendar", async (_label, respond) => {
    const ctx = await createOrg(uniqueSuffix("fail"), { connection: "CONNECTED" });
    const { fetchImpl, urls } = recordingFetch(
      respond as () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
    );

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(urls).toHaveLength(1);
    expect(read.status).toBe("READ_FAILED");
    expect(read.status).not.toBe("READ_OK");
    expect(read.events).toEqual([]);
    // No provider error text or detail is carried anywhere in the result.
    expect(JSON.stringify(read)).not.toMatch(/provider detail|HTTP_|Nylas|fetch failed/i);
  });

  it("READ_PARTIAL: events the provider returned but METRIX cannot represent make the read incomplete, not empty", async () => {
    const ctx = await createOrg(uniqueSuffix("partial"), { connection: "CONNECTED" });
    const { fetchImpl } = recordingFetch(
      okBody({
        data: [
          { id: "ok1", title: "Toplantı", when: { object: "timespan", start_time: 1_726_500_000, end_time: 1_726_503_600 } },
          { id: "odd1", title: "Bilinmeyen", when: { object: "time", time: 1_726_500_000 } },
          { title: "Kimliksiz", when: { object: "date", date: "2026-09-20" } }
        ]
      })
    );

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read.status).toBe("READ_PARTIAL");
    expect(read.skippedCount).toBe(2);
    expect(read.events).toHaveLength(1);
  });

  it("READ_PARTIAL: a list where nothing could be represented is never reported as an empty calendar", async () => {
    const ctx = await createOrg(uniqueSuffix("allskipped"), { connection: "CONNECTED" });
    const { fetchImpl } = recordingFetch(
      okBody({ data: [{ id: "odd1", title: "Bilinmeyen", when: { object: "time", time: 1 } }] })
    );

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read.events).toEqual([]);
    expect(read.status).toBe("READ_PARTIAL");
    expect(read.status).not.toBe("READ_OK");
  });

  it("an untitled provider event is kept with a placeholder title instead of being dropped", async () => {
    const ctx = await createOrg(uniqueSuffix("untitled"), { connection: "CONNECTED" });
    const { fetchImpl } = recordingFetch(
      okBody({
        data: [
          { id: "u1", title: "   ", when: { object: "date", date: "2026-09-20" } },
          { id: "u2", when: { object: "date", date: "2026-09-21" } }
        ]
      })
    );

    const read = await lookupExternalCalendarEvents(ctx, fetchImpl);

    expect(read.status).toBe("READ_OK");
    expect(read.events.map(event => event.title)).toEqual(["(Başlık yok)", "(Başlık yok)"]);
  });

  it("an invalid range boundary throws before any provider call (no silent NaN request)", async () => {
    const ctx = await createOrg(uniqueSuffix("badrange"), { connection: "CONNECTED" });
    const { fetchImpl, urls } = recordingFetch(okBody({ data: [] }));

    await expect(
      lookupExternalCalendarEvents({ ...ctx, endsAfter: "not-a-date" }, fetchImpl)
    ).rejects.toBeInstanceOf(RangeError);

    expect(urls).toEqual([]);
  });
});

describe("external calendar lookup — tenant isolation at its own boundary", () => {
  it("an organization only ever reads with its own grant, never another tenant's", async () => {
    const orgA = await createOrg(uniqueSuffix("tenant-a"), {
      connection: "CONNECTED",
      grantId: "grant-tenant-a"
    });
    const orgB = await createOrg(uniqueSuffix("tenant-b"), {
      connection: "CONNECTED",
      grantId: "grant-tenant-b"
    });
    const orgC = await createOrg(uniqueSuffix("tenant-c"));

    const a = recordingFetch(okBody({ data: [] }));
    await lookupExternalCalendarEvents(orgA, a.fetchImpl);
    expect(a.urls).toHaveLength(1);
    expect(a.urls[0]).toContain("/grants/grant-tenant-a/");
    expect(a.urls.join(" ")).not.toContain("grant-tenant-b");

    const b = recordingFetch(okBody({ data: [] }));
    await lookupExternalCalendarEvents(orgB, b.fetchImpl);
    expect(b.urls[0]).toContain("/grants/grant-tenant-b/");
    expect(b.urls.join(" ")).not.toContain("grant-tenant-a");

    // An organization with no connection of its own never borrows another's.
    const c = recordingFetch(okBody({ data: [{ id: "leak", title: "leak", when: { object: "date", date: "2026-09-20" } }] }));
    const cRead = await lookupExternalCalendarEvents(orgC, c.fetchImpl);
    expect(cRead.status).toBe("NOT_CONNECTED");
    expect(cRead.events).toEqual([]);
    expect(c.urls).toEqual([]);
  });

  it("checks organization access itself: a user of org C cannot read org A's calendar, and no provider call is made", async () => {
    const orgA = await createOrg(uniqueSuffix("access-a"), {
      connection: "CONNECTED",
      grantId: "grant-access-a"
    });
    const orgC = await createOrg(uniqueSuffix("access-c"));
    const { fetchImpl, urls } = recordingFetch(okBody({ data: [] }));

    await expect(
      lookupExternalCalendarEvents(
        { actorUserId: orgC.actorUserId, organizationId: orgA.organizationId },
        fetchImpl
      )
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);

    expect(urls).toEqual([]);
  });
});
