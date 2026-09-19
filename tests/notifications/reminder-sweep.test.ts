import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { executeMetrixBusinessTool } from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { REMINDER_LEAD_MS, runReminderSweep } from "../../src/lib/notifications/reminder-sweep";
import { GET as sweepGet, POST as sweepPost } from "../../src/app/api/internal/reminders/sweep/route";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_TZ = process.env.TZ;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  process.env.TZ = ORIGINAL_TZ;
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  for (const organizationId of createdOrgs.splice(0)) {
    await db.notification.deleteMany({ where: { organizationId } });
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.task.deleteMany({ where: { organizationId } });
    await db.calendarEvent.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

let counter = 0;

async function createOrg(label: string, options: { timezone?: string } = {}) {
  counter += 1;
  const organizationId = `rs-org-${suffix}-${label}-${counter}`;
  await db.organization.create({ data: { id: organizationId, name: "Reminder Org" } });
  createdOrgs.push(organizationId);

  const users: Record<"owner" | "admin" | "member" | "assignee", string> = { owner: "", admin: "", member: "", assignee: "" };
  const roles = { owner: "OWNER", admin: "ADMIN", member: "MEMBER", assignee: "MEMBER" } as const;

  for (const key of Object.keys(users) as Array<keyof typeof users>) {
    const userId = `rs-user-${suffix}-${label}-${counter}-${key}`;
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: key, ...(options.timezone ? { timezone: options.timezone } : {}) }
    });
    await db.organizationMember.create({ data: { organizationId, userId, role: roles[key] } });
    createdUsers.push(userId);
    users[key] = userId;
  }

  return { organizationId, users };
}

// T = 10:00 Europe/Istanbul = 07:00Z. The date is deliberately one no other
// test file uses: the sweep scans every organization by design, and other
// files run in parallel against the same database.
const T = new Date("2031-03-05T07:00:00.000Z");
const at = (minutesBeforeT: number) => new Date(T.getTime() - minutesBeforeT * 60_000);

const remindersOf = (organizationId: string) =>
  db.notification.findMany({ where: { organizationId, title: { in: ["Görev yaklaşıyor", "Toplantı yaklaşıyor"] } }, orderBy: { createdAt: "asc" } });

async function makeTask(org: { organizationId: string; users: { owner: string; assignee: string } }, data: Record<string, unknown> = {}) {
  return db.task.create({
    data: {
      organizationId: org.organizationId,
      title: "Ahmet'i ara",
      dueAt: T,
      createdByUserId: org.users.owner,
      assignedToUserId: org.users.assignee,
      ...data
    } as never
  });
}

async function makeEvent(org: { organizationId: string; users: { owner: string } }, data: Record<string, unknown> = {}) {
  return db.calendarEvent.create({
    data: {
      organizationId: org.organizationId,
      userId: org.users.owner,
      title: "METRIX Calendar Acceptance",
      startsAt: new Date("2031-03-05T11:00:00.000Z"),
      endsAt: new Date("2031-03-05T12:00:00.000Z"),
      ...data
    } as never
  });
}

const E = new Date("2031-03-05T11:00:00.000Z"); // 14:00 Istanbul
const atE = (minutesBefore: number) => new Date(E.getTime() - minutesBefore * 60_000);

describe("task reminders — 15 minutes before Task.dueAt, server-side", () => {
  it("creates exactly one TASKS reminder for the task's assignee in the 15-minute window; repeated sweeps stay at one", async () => {
    const org = await createOrg("task");
    await makeTask(org);

    const first = await runReminderSweep(at(15));
    expect(first.tasks).toMatchObject({ considered: 1, created: 1, replayed: 0, failed: 0 });

    for (const minutes of [14, 10, 5, 1]) {
      const again = await runReminderSweep(at(minutes));
      expect(again.tasks).toMatchObject({ created: 0, replayed: 1 });
    }

    const rows = await remindersOf(org.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: org.users.assignee,
      organizationId: org.organizationId,
      category: "TASKS",
      title: "Görev yaklaşıyor",
      body: "Ahmet'i ara — 10:00",
      readAt: null
    });
  });

  it("nothing before the window opens (T-16m) and nothing once the task is due or past", async () => {
    const org = await createOrg("window");
    await makeTask(org);

    expect((await runReminderSweep(at(16))).tasks.considered).toBe(0);
    expect((await runReminderSweep(new Date(T.getTime()))).tasks.considered).toBe(0);
    expect((await runReminderSweep(new Date(T.getTime() + 60_000))).tasks.considered).toBe(0);
    expect(await remindersOf(org.organizationId)).toHaveLength(0);
    expect(REMINDER_LEAD_MS).toBe(15 * 60_000);
  });

  it.each(["DONE", "CANCELLED"])("a %s task gets no reminder", async status => {
    const org = await createOrg(`s-${status}`);
    await makeTask(org, { status });

    expect((await runReminderSweep(at(10))).tasks.considered).toBe(0);
    expect(await remindersOf(org.organizationId)).toHaveLength(0);
  });

  it("a moved due date: the old instant no longer reminds, the new instant reminds once", async () => {
    const org = await createOrg("moved");
    const task = await makeTask(org);

    await runReminderSweep(at(15)); // reminder for T
    expect(await remindersOf(org.organizationId)).toHaveLength(1);

    const later = new Date(T.getTime() + 2 * 3_600_000); // 12:00 Istanbul
    await db.task.update({ where: { id: task.id }, data: { dueAt: later } });

    // At the OLD window the task is not near any more → nothing for it.
    expect((await runReminderSweep(at(10))).tasks.considered).toBe(0);
    expect(await remindersOf(org.organizationId)).toHaveLength(1);

    // At the NEW window a fresh reminder is created — with the new time.
    const sweep = await runReminderSweep(new Date(later.getTime() - 15 * 60_000));
    expect(sweep.tasks).toMatchObject({ created: 1, replayed: 0 });
    expect(await runReminderSweep(new Date(later.getTime() - 5 * 60_000))).toMatchObject({ tasks: { created: 0, replayed: 1 } });

    const rows = await remindersOf(org.organizationId);
    // Compared as a set: two reminders can share a creation millisecond.
    expect(rows.map(row => row.body).sort()).toEqual(["Ahmet'i ara — 10:00", "Ahmet'i ara — 12:00"]);
  });

  it("goes to the task's real owner only — not to the organization's owners/admins", async () => {
    const org = await createOrg("recipient");
    await makeTask(org); // assigned to `assignee`, created by `owner`
    await makeTask(org, { title: "Atanmamış", assignedToUserId: null, createdByUserId: org.users.member });

    await runReminderSweep(at(15));

    const rows = await remindersOf(org.organizationId);
    const byBody = Object.fromEntries(rows.map(row => [row.body, row.userId]));
    expect(byBody["Ahmet'i ara — 10:00"]).toBe(org.users.assignee);
    expect(byBody["Atanmamış — 10:00"]).toBe(org.users.member);
    expect(rows.some(row => row.userId === org.users.admin)).toBe(false);
    expect(rows.filter(row => row.userId === org.users.owner)).toHaveLength(0);
  });

  it("wrong user / wrong org: an assignee who is not a member of the task's organization is never notified", async () => {
    const a = await createOrg("xa");
    const b = await createOrg("xb");
    await makeTask(a, { assignedToUserId: b.users.owner });

    const sweep = await runReminderSweep(at(15));

    expect(sweep.tasks).toMatchObject({ considered: 1, created: 0, skipped: 1 });
    expect(await db.notification.count({ where: { userId: b.users.owner } })).toBe(0);
    expect(await remindersOf(a.organizationId)).toHaveLength(0);
    expect(await remindersOf(b.organizationId)).toHaveLength(0);
  });

  it("a task with nobody responsible is skipped, never broadcast", async () => {
    const org = await createOrg("nobody");
    await makeTask(org, { assignedToUserId: null, createdByUserId: null });

    expect((await runReminderSweep(at(15))).tasks).toMatchObject({ considered: 1, created: 0, skipped: 1 });
  });

  it("the reminder is distinct from the immediate 'Görev oluşturuldu' notification (separate identities, both exist)", async () => {
    const org = await createOrg("distinct");

    await executeMetrixBusinessTool({
      name: "task_create",
      argumentsJson: JSON.stringify({ title: "Ahmet'i ara", dueAt: "2031-03-05T10:00:00+03:00" }),
      context: { actorUserId: org.users.owner, organizationId: org.organizationId, idempotencyScope: `turn:rs-${suffix}-distinct`, timezone: "Europe/Istanbul", referenceTimeIso: "2026-09-18T09:00:00.000Z" }
    });
    await runReminderSweep(at(15));
    await runReminderSweep(at(10));

    const titles = (await db.notification.findMany({ where: { organizationId: org.organizationId, userId: org.users.owner } })).map(row => row.title).sort();
    expect(titles).toEqual(["Görev oluşturuldu: Ahmet'i ara", "Görev yaklaşıyor"]);
  });
});

describe("calendar reminders — 15 minutes before CalendarEvent.startsAt", () => {
  it("creates exactly one TASKS reminder for the event owner; repeated sweeps stay at one", async () => {
    const org = await createOrg("event");
    await makeEvent(org);

    expect((await runReminderSweep(atE(15))).calendarEvents).toMatchObject({ considered: 1, created: 1 });
    for (const minutes of [12, 8, 2]) {
      expect((await runReminderSweep(atE(minutes))).calendarEvents).toMatchObject({ created: 0, replayed: 1 });
    }

    const rows = await remindersOf(org.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: org.users.owner,
      category: "TASKS",
      title: "Toplantı yaklaşıyor",
      body: "METRIX Calendar Acceptance — 14:00"
    });
  });

  it("a moved event reminds for its new start, not the stale one", async () => {
    const org = await createOrg("event-moved");
    const event = await makeEvent(org);
    await runReminderSweep(atE(15));

    const later = new Date(E.getTime() + 3_600_000); // 15:00
    await db.calendarEvent.update({ where: { id: event.id }, data: { startsAt: later, endsAt: new Date(later.getTime() + 3_600_000) } });

    expect((await runReminderSweep(atE(10))).calendarEvents.considered).toBe(0);
    expect((await runReminderSweep(new Date(later.getTime() - 15 * 60_000))).calendarEvents.created).toBe(1);

    expect((await remindersOf(org.organizationId)).map(row => row.body).sort()).toEqual([
      "METRIX Calendar Acceptance — 14:00",
      "METRIX Calendar Acceptance — 15:00"
    ]);
  });

  it("past or already-started events and all-day events never produce a late/spam reminder", async () => {
    const org = await createOrg("event-stale");
    const min = 60_000;
    await makeEvent(org, { title: "Bitti", startsAt: new Date(E.getTime() - 60 * min), endsAt: new Date(E.getTime() - 30 * min) });
    await makeEvent(org, { title: "Başladı", startsAt: new Date(E.getTime() - 1 * min), endsAt: new Date(E.getTime() + 60 * min) });
    await makeEvent(org, { title: "Tüm gün", allDay: true, startsAt: new Date(E.getTime() + 5 * min), endsAt: new Date(E.getTime() + 24 * 60 * min) });
    await makeEvent(org, { title: "Yaklaşan", startsAt: new Date(E.getTime() + 10 * min), endsAt: new Date(E.getTime() + 70 * min) });

    // "now" = E: only the one genuinely upcoming timed event is eligible.
    const sweep = await runReminderSweep(E);

    expect(sweep.calendarEvents).toMatchObject({ considered: 1, created: 1 });
    const rows = await remindersOf(org.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toMatch(/^Yaklaşan — /);
  });

  it("wrong user / wrong org: only the event's own owner in its own organization is notified", async () => {
    const a = await createOrg("event-a");
    const b = await createOrg("event-b");
    await makeEvent(a);
    await makeEvent(a, { userId: b.users.owner, title: "Yanlış tenant kullanıcısı" });

    const sweep = await runReminderSweep(atE(15));

    expect(sweep.calendarEvents).toMatchObject({ considered: 2, created: 1, skipped: 1 });
    expect(await db.notification.count({ where: { userId: b.users.owner } })).toBe(0);
    expect((await remindersOf(a.organizationId)).map(row => row.userId)).toEqual([a.users.owner]);
  });

  it("creating a calendar event sends no immediate notification (the reminder is the notification)", async () => {
    const org = await createOrg("event-silent");

    await executeMetrixBusinessTool({
      name: "calendar_create",
      argumentsJson: JSON.stringify({ title: "Sessiz oluşturma", startsAt: "2031-03-05T14:00:00+03:00", endsAt: "2031-03-05T15:00:00+03:00" }),
      context: { actorUserId: org.users.owner, organizationId: org.organizationId, idempotencyScope: `turn:rs-${suffix}-evsilent`, timezone: "Europe/Istanbul", referenceTimeIso: "2026-09-18T09:00:00.000Z" }
    });

    expect(await db.notification.count({ where: { organizationId: org.organizationId } })).toBe(0);
    await runReminderSweep(atE(15));
    expect(await db.notification.count({ where: { organizationId: org.organizationId } })).toBe(1);
  });
});

describe("timezone — the recipient's own timezone, never the server's", () => {
  it("formats the reminder time from the user's timezone regardless of the process TZ", async () => {
    const istanbul = await createOrg("tz-ist");
    const tokyo = await createOrg("tz-tok", { timezone: "Asia/Tokyo" });
    await makeTask(istanbul);
    await makeTask(tokyo);

    for (const tz of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      await runReminderSweep(at(15));
    }

    expect((await remindersOf(istanbul.organizationId)).map(row => row.body)).toEqual(["Ahmet'i ara — 10:00"]);
    expect((await remindersOf(tokyo.organizationId)).map(row => row.body)).toEqual(["Ahmet'i ara — 16:00"]);
  });
});

describe("protected sweep endpoint — server-side scheduler entry", () => {
  const call = (handler: typeof sweepGet, authorization?: string) =>
    handler(new Request("http://localhost/api/internal/reminders/sweep", { headers: authorization ? { authorization } : {} }));

  it("fails closed without a configured secret and rejects a missing or wrong one", async () => {
    delete process.env.CRON_SECRET;
    expect((await call(sweepGet, "Bearer anything")).status).toBe(503);

    process.env.CRON_SECRET = "correct-horse-battery-staple";
    expect((await call(sweepGet)).status).toBe(401);
    expect((await call(sweepGet, "Bearer wrong-secret-of-equal-len!")).status).toBe(401);
    expect((await call(sweepPost, "Bearer nope")).status).toBe(401);
  });

  it("with the secret it runs the sweep (GET as Vercel Cron sends, and POST) and returns counts only", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const org = await createOrg("endpoint");
    const soon = new Date(Date.now() + 10 * 60_000);
    await makeTask(org, { title: "Gizli görev başlığı", dueAt: soon });

    const response = await call(sweepGet, "Bearer correct-horse-battery-staple");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.tasks.considered).toBeGreaterThanOrEqual(1);
    // Counts only: no titles, ids or notification content in the response.
    expect(JSON.stringify(payload)).not.toMatch(/Gizli görev|rs-user|rs-org|sourceId/);
    expect(await remindersOf(org.organizationId)).toHaveLength(1);

    // A second trigger (POST, or a duplicated cron delivery) changes nothing.
    expect((await call(sweepPost, "Bearer correct-horse-battery-staple")).status).toBe(200);
    expect(await remindersOf(org.organizationId)).toHaveLength(1);
  });
});
