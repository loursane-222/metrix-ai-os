import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import {
  CalendarCreateToolParameters,
  CalendarUpdateToolParameters,
  beginToolCallCapture,
  canonicalResultsFromToolCalls,
  endToolCallCapture,
  executeMetrixBusinessTool
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

// METRIX's own calendar is the canonical business calendar. Everything
// here runs the real canonical chain (dispatch → native persistence →
// readback → projection) with no Google/iCloud connection unless a test
// connects one explicitly, and a stubbed global fetch so nothing can reach
// a real provider.

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Fetched = { ok: boolean; status: number; json: () => Promise<unknown> };
let respond: () => Promise<Fetched> = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) });
let requestedUrls: string[] = [];

const createdOrgs: string[] = [];
const createdUsers: string[] = [];

async function createOrg(label: string, options: { google?: boolean; users?: number } = {}) {
  const organizationId = `nbc-org-${suffix}-${label}`;
  await db.organization.create({ data: { id: organizationId, name: "Native Calendar Org" } });
  createdOrgs.push(organizationId);

  const userIds: string[] = [];
  for (let index = 0; index < (options.users ?? 1); index += 1) {
    const userId = `nbc-user-${suffix}-${label}-${index}`;
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: `User ${index}` } });
    await db.organizationMember.create({
      data: { organizationId, userId, role: index === 0 ? "OWNER" : "MEMBER" }
    });
    createdUsers.push(userId);
    userIds.push(userId);
  }

  if (options.google) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: `grant-${label}`, email: "o@example.test", provider: "google" })
        )
      }
    });
  }

  return { organizationId, userIds };
}

let turn = 0;

function ctx(organizationId: string, userId: string, scope?: string) {
  turn += 1;
  return {
    actorUserId: userId,
    organizationId,
    idempotencyScope: scope ?? `turn:nbc-${suffix}-${turn}`,
    timezone: "Europe/Istanbul",
    referenceTimeIso: "2026-09-18T09:00:00.000Z"
  };
}

async function call(
  name: Parameters<typeof executeMetrixBusinessTool>[0]["name"],
  args: Record<string, unknown>,
  context: ReturnType<typeof ctx>
) {
  return (await executeMetrixBusinessTool({ name, argumentsJson: JSON.stringify(args), context })) as Record<string, any>;
}

// "Tomorrow" from the reference time 2026-09-18T12:00+03:00 is 2026-09-19 in
// the user's timezone (+03:00).
const TOMORROW = {
  endsAfter: "2026-09-19T00:00:00+03:00",
  startsBefore: "2026-09-19T23:59:59+03:00",
  mode: "DAY"
};
const DAY_AFTER = {
  endsAfter: "2026-09-20T00:00:00+03:00",
  startsBefore: "2026-09-20T23:59:59+03:00",
  mode: "DAY"
};

beforeAll(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  vi.stubGlobal("fetch", async (url: string) => {
    requestedUrls.push(url);
    return respond();
  });
});

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  requestedUrls = [];
  respond = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) });
});

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.calendarEvent.deleteMany({ where: { organizationId } });
    await db.task.deleteMany({ where: { organizationId } });
    await db.notification.deleteMany({ where: { organizationId } });
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

describe("native METRIX calendar — create, readback, read (no Google, no iCloud)", () => {
  it("creates a real CalendarEvent for the right org/user/instant, VERIFIED by readback, and reads it back as tomorrow's schedule", async () => {
    const { organizationId, userIds } = await createOrg("create");
    const [userId] = userIds as [string];

    const created = await call(
      "calendar_create",
      { title: "Ahmet'le toplantı", startsAt: "2026-09-19T14:00:00+03:00", endsAt: "2026-09-19T15:00:00+03:00" },
      ctx(organizationId, userId)
    );

    expect(created).toMatchObject({ action: "calendar.create", status: "VERIFIED", verified: true, replayed: false });

    const rows = await db.calendarEvent.findMany({ where: { organizationId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organizationId, userId, title: "Ahmet'le toplantı", allDay: false });
    // 14:00 in +03:00 is exactly 11:00Z — no server-timezone drift.
    expect(rows[0]!.startsAt.toISOString()).toBe("2026-09-19T11:00:00.000Z");
    expect(rows[0]!.endsAt.toISOString()).toBe("2026-09-19T12:00:00.000Z");

    const listed = await call("calendar_list", TOMORROW, ctx(organizationId, userId));

    expect(listed.events.map((e: { title: string }) => e.title)).toEqual(["Ahmet'le toplantı"]);
    // Native calendar works with no Google connection and no provider call.
    expect(listed.externalCalendar).toEqual({ status: "NOT_CONNECTED", connected: false, verified: false });
    expect(requestedUrls).toEqual([]);
  });

  it("is idempotent: the same create in the same turn does not duplicate", async () => {
    const { organizationId, userIds } = await createOrg("dup");
    const [userId] = userIds as [string];
    const context = ctx(organizationId, userId);
    const args = { title: "Tek toplantı", startsAt: "2026-09-19T14:00:00+03:00", endsAt: "2026-09-19T15:00:00+03:00" };

    const first = await call("calendar_create", args, context);
    const second = await call("calendar_create", args, context);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(await db.calendarEvent.count({ where: { organizationId } })).toBe(1);
  });

  it.each([
    ["+03:00", "2026-09-19T14:00:00+03:00", "2026-09-19T11:00:00.000Z"],
    ["Z", "2026-09-19T11:00:00Z", "2026-09-19T11:00:00.000Z"],
    ["-05:00", "2026-09-19T06:00:00-05:00", "2026-09-19T11:00:00.000Z"]
  ])("stores the exact instant for an %s offset", async (_label, startsAt, expectedUtc) => {
    const { organizationId, userIds } = await createOrg("tz");
    const [userId] = userIds as [string];

    await call(
      "calendar_create",
      { title: "TZ", startsAt, endsAt: new Date(Date.parse(expectedUtc) + 3_600_000).toISOString() },
      ctx(organizationId, userId)
    );

    const row = await db.calendarEvent.findFirstOrThrow({ where: { organizationId } });
    expect(row.startsAt.toISOString()).toBe(expectedUtc);
  });

  it("rejects an offset-less start/end at the tool contract and persists nothing", async () => {
    const { organizationId, userIds } = await createOrg("noffset");
    const [userId] = userIds as [string];

    expect(
      CalendarCreateToolParameters.safeParse({ title: "x", startsAt: "2026-09-19T14:00:00", endsAt: "2026-09-19T15:00:00Z" }).success
    ).toBe(false);
    expect(CalendarUpdateToolParameters.safeParse({ eventId: "e", startsAt: "2026-09-19T14:00:00" }).success).toBe(false);
    expect(
      CalendarCreateToolParameters.safeParse({ title: "x", startsAt: "2026-09-19T14:00:00+03:00", endsAt: "2026-09-19T15:00:00+03:00" }).success
    ).toBe(true);

    await expect(
      call("calendar_create", { title: "x", startsAt: "2026-09-19T14:00:00", endsAt: "2026-09-19T15:00:00" }, ctx(organizationId, userId))
    ).rejects.toThrow();
    expect(await db.calendarEvent.count({ where: { organizationId } })).toBe(0);
  });

  it("does not persist or report success when the end precedes the start", async () => {
    const { organizationId, userIds } = await createOrg("badrange");
    const [userId] = userIds as [string];

    await expect(
      call("calendar_create", { title: "x", startsAt: "2026-09-19T15:00:00+03:00", endsAt: "2026-09-19T14:00:00+03:00" }, ctx(organizationId, userId))
    ).rejects.toThrow();
    expect(await db.calendarEvent.count({ where: { organizationId } })).toBe(0);
  });

  it("tenant isolation: another organization (and another user) never sees this event", async () => {
    const a = await createOrg("iso-a", { users: 2 });
    const b = await createOrg("iso-b");

    await call(
      "calendar_create",
      { title: "Sadece A", startsAt: "2026-09-19T14:00:00+03:00", endsAt: "2026-09-19T15:00:00+03:00" },
      ctx(a.organizationId, a.userIds[0]!)
    );

    const other = await call("calendar_list", TOMORROW, ctx(b.organizationId, b.userIds[0]!));
    expect(other.events).toEqual([]);

    const teammate = await call("calendar_list", TOMORROW, ctx(a.organizationId, a.userIds[1]!));
    expect(teammate.events).toEqual([]);

    // A user of org B cannot act inside org A at all.
    await expect(call("calendar_list", TOMORROW, ctx(a.organizationId, b.userIds[0]!))).rejects.toThrow();
  });

  it("empty is reported as empty: no events on a day with a verified-empty read", async () => {
    const { organizationId, userIds } = await createOrg("empty", { google: true });
    const [userId] = userIds as [string];

    const listed = await call("calendar_list", TOMORROW, ctx(organizationId, userId));

    expect(listed.events).toEqual([]);
    expect(listed.externalCalendar).toEqual({ status: "READ_OK", connected: true, verified: true });
  });
});

describe("Task → Calendar: a read-time projection of the canonical Task (no copy)", () => {
  async function createTask(organizationId: string, userId: string, args: Record<string, unknown>) {
    return call("task_create", { priority: "MEDIUM", ...args }, ctx(organizationId, userId));
  }

  it("a dated task appears on tomorrow's calendar as kind TASK, with no CalendarEvent copy", async () => {
    const { organizationId, userIds } = await createOrg("task");
    const [userId] = userIds as [string];

    const created = await createTask(organizationId, userId, {
      title: "Ahmet'i ara",
      dueAt: "2026-09-19T10:00:00+03:00"
    });
    expect(created.task.dueAt).toBe("2026-09-19T07:00:00.000Z");

    const listed = await call("calendar_list", TOMORROW, ctx(organizationId, userId));

    expect(listed.events).toHaveLength(1);
    expect(listed.events[0]).toMatchObject({
      title: "Görev: Ahmet'i ara",
      kind: "TASK",
      startsAt: "2026-09-19T07:00:00.000Z",
      allDay: false
    });
    // One business truth: the Task row. Nothing was materialized as an event.
    expect(await db.calendarEvent.count({ where: { organizationId } })).toBe(0);
    expect(await db.task.count({ where: { organizationId } })).toBe(1);

    // It reaches the calendar workspace presentation with a meaningful title.
    turn += 1;
    const scope = `turn:nbc-view-${suffix}-${turn}`;
    beginToolCallCapture(scope);
    await call("calendar_list", TOMORROW, ctx(organizationId, userId, scope));
    const view = projectCapabilityResults(canonicalResultsFromToolCalls(endToolCallCapture(scope)))[0] as {
      type: string;
      events: Array<{ title: string }>;
    };
    expect(view.type).toBe("CALENDAR");
    expect(view.events.map(e => e.title)).toEqual(["Görev: Ahmet'i ara"]);
  });

  it("a changed due date moves the calendar item — it can never show the stale date", async () => {
    const { organizationId, userIds } = await createOrg("move");
    const [userId] = userIds as [string];
    const created = await createTask(organizationId, userId, { title: "Taşınacak", dueAt: "2026-09-19T10:00:00+03:00" });

    expect((await call("calendar_list", TOMORROW, ctx(organizationId, userId))).events).toHaveLength(1);

    await call("task_update", { taskId: created.task.id, dueAt: "2026-09-20T10:00:00+03:00" }, ctx(organizationId, userId));

    expect((await call("calendar_list", TOMORROW, ctx(organizationId, userId))).events).toEqual([]);
    const moved = await call("calendar_list", DAY_AFTER, ctx(organizationId, userId));
    expect(moved.events.map((e: { title: string }) => e.title)).toEqual(["Görev: Taşınacak"]);
  });

  it.each(["DONE", "CANCELLED"])("a %s task no longer appears as active work", async status => {
    const { organizationId, userIds } = await createOrg(`status-${status}`);
    const [userId] = userIds as [string];
    const created = await createTask(organizationId, userId, { title: "Bitecek", dueAt: "2026-09-19T10:00:00+03:00" });

    await call("task_update", { taskId: created.task.id, status }, ctx(organizationId, userId));

    expect((await call("calendar_list", TOMORROW, ctx(organizationId, userId))).events).toEqual([]);
  });

  it("an undated task is not a calendar item", async () => {
    const { organizationId, userIds } = await createOrg("undated");
    const [userId] = userIds as [string];
    await createTask(organizationId, userId, { title: "Tarihsiz" });

    expect((await call("calendar_list", {}, ctx(organizationId, userId))).events).toEqual([]);
  });

  it("scopes to the user's own schedule and never across tenants", async () => {
    const a = await createOrg("scope-a", { users: 2 });
    const b = await createOrg("scope-b");
    const [owner, member] = a.userIds as [string, string];

    await db.task.create({
      data: { organizationId: a.organizationId, title: "Üyeye atanmış", dueAt: new Date("2026-09-19T07:00:00Z"), createdByUserId: owner, assignedToUserId: member }
    });
    await db.task.create({
      data: { organizationId: b.organizationId, title: "Başka şirket", dueAt: new Date("2026-09-19T07:00:00Z"), createdByUserId: b.userIds[0]!, assignedToUserId: b.userIds[0]! }
    });

    const forOwner = await call("calendar_list", TOMORROW, ctx(a.organizationId, owner));
    expect(forOwner.events).toEqual([]);

    const forMember = await call("calendar_list", TOMORROW, ctx(a.organizationId, member));
    expect(forMember.events.map((e: { title: string }) => e.title)).toEqual(["Görev: Üyeye atanmış"]);
    expect(JSON.stringify(forMember)).not.toContain("Başka şirket");
  });

  it("native events, tasks and a failed Google read coexist: nothing native is lost and the failure is not hidden", async () => {
    const { organizationId, userIds } = await createOrg("google-down", { google: true });
    const [userId] = userIds as [string];
    respond = async () => ({ ok: false, status: 503, json: async () => ({}) });

    await call("calendar_create", { title: "Yerel toplantı", startsAt: "2026-09-19T14:00:00+03:00", endsAt: "2026-09-19T15:00:00+03:00" }, ctx(organizationId, userId));
    await createTask(organizationId, userId, { title: "Yerel görev", dueAt: "2026-09-19T10:00:00+03:00" });

    turn += 1;
    const scope = `turn:nbc-gdown-${suffix}-${turn}`;
    beginToolCallCapture(scope);
    const listed = await call("calendar_list", TOMORROW, ctx(organizationId, userId, scope));
    const view = projectCapabilityResults(canonicalResultsFromToolCalls(endToolCallCapture(scope)))[0] as {
      notice?: string;
      events: Array<{ title: string }>;
    };

    expect(listed.events.map((e: { title: string }) => e.title)).toEqual(["Görev: Yerel görev", "Yerel toplantı"]);
    expect(listed.externalCalendar).toEqual({ status: "READ_FAILED", connected: true, verified: false });
    expect(view.events).toHaveLength(2);
    expect(view.notice).toMatch(/doğrulanamadı/);
  });

  it("Google stays an optional external context: when it reads fine its events join the same result", async () => {
    const { organizationId, userIds } = await createOrg("google-up", { google: true });
    const [userId] = userIds as [string];
    respond = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: "g1", title: "Google Toplantısı", when: { object: "timespan", start_time: 1_789_797_600, end_time: 1_789_801_200 } }]
      })
    });
    await createTask(organizationId, userId, { title: "Yerel görev", dueAt: "2026-09-19T10:00:00+03:00" });

    const listed = await call("calendar_list", TOMORROW, ctx(organizationId, userId));

    expect(listed.externalCalendar.status).toBe("READ_OK");
    expect(listed.events.map((e: { title: string }) => e.title).sort()).toEqual(["Görev: Yerel görev", "Google Toplantısı"].sort());
  });
});

describe("text and voice share the one canonical Calendar path", () => {
  it("the projection and the notification hook live in the shared runtime, not in any voice or Live code", () => {
    const runtime = readFileSync("src/lib/agent/tools/metrix-business-tool-runtime.ts", "utf8");
    expect(runtime).toContain("listTaskCalendarItems");
    expect(runtime).toContain("emitBusinessEventNotifications");

    for (const path of [
      "src/lib/live/live-delegation-bridge.ts",
      "src/lib/live/live-session-service.ts",
      "src/lib/live/live-sideband-service.ts"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("calendar-task-projection");
      expect(source).not.toContain("business-event-notifications");
      expect(source).not.toContain("executeNotificationCreate");
    }
  });
});
