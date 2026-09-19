import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import { executeMetrixBusinessTool } from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { listNotificationsForUser } from "../../src/lib/actions/notification-list";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  listDeliverableNotifications,
  loadNotificationPreferences,
  updateNotificationPreferences
} from "../../src/lib/notifications/notification-preferences";
import {
  INITIAL_SOUND_STATE,
  decideSound
} from "../../src/components/living-workspace/notification-delivery-state";

// Only the session boundary is replaced for the API tests; routes, actions
// and the database are real.
const authState: { current: { actorUserId: string; organizationId: string } | null } = { current: null };

vi.mock("../../src/lib/auth/executive-session-context", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/auth/executive-session-context")>();

  return {
    ...original,
    resolveAuthenticatedExecutiveContext: async () => {
      if (!authState.current) throw new original.ExecutiveAuthenticationError("UNAUTHENTICATED", 401);
      return { ...authState.current, timezone: "Europe/Istanbul", referenceTimeIso: new Date().toISOString() };
    }
  };
});

import { GET as feedGet } from "../../src/app/api/notifications/route";
import { GET as prefGet, PUT as prefPut } from "../../src/app/api/notifications/preferences/route";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];

beforeEach(() => {
  authState.current = null;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.notification.deleteMany({ where: { organizationId } });
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.task.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

async function createOrg(label: string, memberCount = 1) {
  const organizationId = `np-org-${suffix}-${label}`;
  await db.organization.create({ data: { id: organizationId, name: "Preference Org" } });
  createdOrgs.push(organizationId);

  const users: string[] = [];
  for (let index = 0; index < memberCount; index += 1) {
    const userId = `np-user-${suffix}-${label}-${index}`;
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: `U${index}` } });
    await db.organizationMember.create({ data: { organizationId, userId, role: index === 0 ? "OWNER" : "MEMBER" } });
    createdUsers.push(userId);
    users.push(userId);
  }
  return { organizationId, users };
}

const wait = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));

function note(organizationId: string, userId: string, category: string, title = `${category} olayı`) {
  return db.notification.create({
    data: { organizationId, userId, category, priority: "NORMAL", title }
  });
}

const deliverable = async (organizationId: string, userId: string) =>
  (await listDeliverableNotifications({ userId, organizationId })).notifications.map(n => n.title);

describe("notification preferences — model, defaults, isolation", () => {
  it("an existing user defaults to every category on and 'Hiç konuşmasın' off", async () => {
    const { users } = await createOrg("default");

    expect(await loadNotificationPreferences(users[0]!)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({ critical: true, finance: true, sales: true, tasks: true, muteAll: false });
  });

  it("persists per user with readback, and one user's choice never affects another", async () => {
    const { users } = await createOrg("iso", 2);

    const saved = await updateNotificationPreferences({ actorUserId: users[0]!, patch: { tasks: false, muteAll: false } });

    expect(saved).toEqual({ critical: true, finance: true, sales: true, tasks: false, muteAll: false });
    expect(await loadNotificationPreferences(users[0]!)).toEqual(saved);
    expect(await loadNotificationPreferences(users[1]!)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe("delivery preferences — applied at DELIVERY, never at persistence", () => {
  it("default: an existing user's task notification is toast-eligible", async () => {
    const { organizationId, users } = await createOrg("elig");
    await note(organizationId, users[0]!, "TASKS", "Görev oluşturuldu: X");

    expect(await deliverable(organizationId, users[0]!)).toEqual(["Görev oluşturuldu: X"]);
  });

  it.each([
    ["TASKS", "tasks"],
    ["FINANCE", "finance"],
    ["SALES", "sales"],
    ["CRITICAL", "critical"]
  ] as const)("%s disabled: that category is not delivered, others are, and nothing is deleted", async (category, key) => {
    const { organizationId, users } = await createOrg(`cat-${category}`);
    const userId = users[0]!;

    for (const name of ["TASKS", "FINANCE", "SALES", "CRITICAL"]) await note(organizationId, userId, name, `${name} olayı`);
    await updateNotificationPreferences({ actorUserId: userId, patch: { [key]: false } });

    const shown = await deliverable(organizationId, userId);
    expect(shown).not.toContain(`${category} olayı`);
    expect(shown).toHaveLength(3);

    // Persistence is untouched: the canonical notification still exists and
    // is readable through the canonical list (what Sol reads).
    const persisted = await listNotificationsForUser({ actorUserId: userId, organizationId });
    expect(persisted.map(n => n.title)).toContain(`${category} olayı`);
    expect(persisted).toHaveLength(4);
  });

  it("a business event still PERSISTS its notification when the category is silenced (only delivery is off)", async () => {
    const { organizationId, users } = await createOrg("persist");
    const userId = users[0]!;
    await updateNotificationPreferences({ actorUserId: userId, patch: { tasks: false } });

    await executeMetrixBusinessTool({
      name: "task_create",
      argumentsJson: JSON.stringify({ title: "Sessiz görev", dueAt: "2026-09-19T14:00:00+03:00" }),
      context: { actorUserId: userId, organizationId, idempotencyScope: `turn:np-${suffix}-persist`, timezone: "Europe/Istanbul", referenceTimeIso: "2026-09-18T09:00:00.000Z" }
    });

    expect(await db.notification.count({ where: { organizationId, userId, category: "TASKS" } })).toBe(1);
    expect(await deliverable(organizationId, userId)).toEqual([]);
  });

  it("'Hiç konuşmasın' silences all proactive delivery but keeps every record", async () => {
    const { organizationId, users } = await createOrg("mute");
    const userId = users[0]!;
    for (const name of ["TASKS", "FINANCE", "SALES", "CRITICAL", "OTHER"]) await note(organizationId, userId, name);

    await updateNotificationPreferences({ actorUserId: userId, patch: { muteAll: true } });

    expect(await listDeliverableNotifications({ userId, organizationId })).toEqual({ notifications: [], unreadCount: 0 });
    expect(await db.notification.count({ where: { organizationId, userId } })).toBe(5);
  });

  it("a notification with no category of its own (explicitly requested from Sol) follows only the mute switch", async () => {
    const { organizationId, users } = await createOrg("other");
    const userId = users[0]!;
    await note(organizationId, userId, "HATIRLATMA", "Bana hatırlat");
    await updateNotificationPreferences({ actorUserId: userId, patch: { tasks: false, finance: false, sales: false, critical: false } });

    expect(await deliverable(organizationId, userId)).toEqual(["Bana hatırlat"]);
  });

  it("removing mute never replays what piled up while muted (no toast storm); new ones deliver", async () => {
    const { organizationId, users } = await createOrg("storm");
    const userId = users[0]!;

    await updateNotificationPreferences({ actorUserId: userId, patch: { muteAll: true } });
    await wait();
    for (let index = 0; index < 5; index += 1) await note(organizationId, userId, "TASKS", `Sessizken ${index}`);
    await wait();

    await updateNotificationPreferences({ actorUserId: userId, patch: { muteAll: false } });
    await wait();

    expect(await deliverable(organizationId, userId)).toEqual([]);
    expect(await db.notification.count({ where: { organizationId, userId, readAt: null } })).toBe(5);

    await note(organizationId, userId, "TASKS", "Mute sonrası yeni");
    expect(await deliverable(organizationId, userId)).toEqual(["Mute sonrası yeni"]);
  });

  it("re-enabling a category never replays that category's backlog either", async () => {
    const { organizationId, users } = await createOrg("backlog");
    const userId = users[0]!;

    await updateNotificationPreferences({ actorUserId: userId, patch: { finance: false } });
    await wait();
    await note(organizationId, userId, "FINANCE", "Kapalıyken tahsilat");
    await wait();
    await updateNotificationPreferences({ actorUserId: userId, patch: { finance: true } });
    await wait();
    await note(organizationId, userId, "FINANCE", "Açıkken tahsilat");

    expect(await deliverable(organizationId, userId)).toEqual(["Açıkken tahsilat"]);
  });

  it("delivery is tenant- and user-scoped: another organization's or user's notifications never appear", async () => {
    const a = await createOrg("ta", 2);
    const b = await createOrg("tb");
    await note(a.organizationId, a.users[1]!, "TASKS", "Başka kullanıcı");
    await note(b.organizationId, b.users[0]!, "TASKS", "Başka tenant");
    await note(a.organizationId, a.users[0]!, "TASKS", "Benim");

    expect(await deliverable(a.organizationId, a.users[0]!)).toEqual(["Benim"]);
    // Even asking for org B with A's user id yields nothing of B's.
    expect(await deliverable(b.organizationId, a.users[0]!)).toEqual([]);
  });

  it("client sound decisions across preference changes: only genuinely new, eligible notifications sound, once", async () => {
    const { organizationId, users } = await createOrg("sound-e2e");
    const userId = users[0]!;
    let state = INITIAL_SOUND_STATE;
    const poll = async () => {
      const decision = decideSound(state, (await listDeliverableNotifications({ userId, organizationId })).notifications.map(n => n.id));
      state = decision.state;
      return decision.play;
    };

    await note(organizationId, userId, "TASKS", "Eski okunmamış");
    expect(await poll()).toBe(false); // page load / refresh: baseline is silent

    await note(organizationId, userId, "TASKS", "Yeni 1");
    expect(await poll()).toBe(true);
    expect(await poll()).toBe(false); // same notification on the next poll

    await updateNotificationPreferences({ actorUserId: userId, patch: { tasks: false } });
    await wait();
    await note(organizationId, userId, "TASKS", "Kapalıyken");
    expect(await poll()).toBe(false); // category disabled → no sound

    await updateNotificationPreferences({ actorUserId: userId, patch: { tasks: true, muteAll: true } });
    await note(organizationId, userId, "SALES", "Mute iken");
    expect(await poll()).toBe(false); // muteAll → no sound

    await updateNotificationPreferences({ actorUserId: userId, patch: { muteAll: false } });
    await wait();
    expect(await poll()).toBe(false); // backlog after unmute → no storm, no sound

    await note(organizationId, userId, "TASKS", "Unmute sonrası");
    expect(await poll()).toBe(true);
  });
});

describe("preferences API — session identity, strict validation, verified result", () => {
  const put = (body: unknown) =>
    prefPut(new Request("http://localhost/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  const get = () => prefGet(new Request("http://localhost/api/notifications/preferences"));

  it("requires an authenticated session", async () => {
    expect((await get()).status).toBe(401);
    expect((await put({ tasks: false })).status).toBe(401);
  });

  it("GET returns only the caller's own preferences; PUT stores and returns the verified value", async () => {
    const { organizationId, users } = await createOrg("api", 2);
    authState.current = { actorUserId: users[0]!, organizationId };

    expect(await (await get()).json()).toEqual({ ok: true, preferences: DEFAULT_NOTIFICATION_PREFERENCES });

    const response = await put({ tasks: false, muteAll: true });
    expect(response.status).toBe(200);
    expect((await response.json()).preferences).toEqual({ critical: true, finance: true, sales: true, tasks: false, muteAll: true });

    // A second user in the same organization is unaffected.
    authState.current = { actorUserId: users[1]!, organizationId };
    expect((await (await get()).json()).preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("cannot target another user or organization: identity keys and unknown categories are rejected", async () => {
    const { organizationId, users } = await createOrg("reject", 2);
    authState.current = { actorUserId: users[0]!, organizationId };

    for (const body of [
      { userId: users[1], tasks: false },
      { organizationId, tasks: false },
      { category: "TASKS", enabled: false },
      { billing: false },
      { tasks: "no" },
      {},
      "not json"
    ]) {
      expect((await put(body)).status).toBe(400);
    }

    expect(await loadNotificationPreferences(users[1]!)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(await loadNotificationPreferences(users[0]!)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("the toast feed applies the caller's preferences and leaks no internal state", async () => {
    const { organizationId, users } = await createOrg("feed");
    authState.current = { actorUserId: users[0]!, organizationId };
    await db.notification.create({ data: { organizationId, userId: users[0]!, category: "TASKS", priority: "NORMAL", title: "Görev A", sourceType: "Task", sourceId: "internal-id-77" } });
    await db.notification.create({ data: { organizationId, userId: users[0]!, category: "FINANCE", priority: "HIGH", title: "Tahsilat B" } });

    await put({ tasks: false });
    const payload = await (await feedGet(new Request("http://localhost/api/notifications"))).json();

    expect(payload.notifications.map((n: { title: string }) => n.title)).toEqual(["Tahsilat B"]);
    expect(payload.unreadCount).toBe(1);
    expect(JSON.stringify(payload)).not.toMatch(/internal-id-77|sourceId|sourceType|Görev A/);

    await put({ muteAll: true });
    expect(await (await feedGet(new Request("http://localhost/api/notifications"))).json()).toMatchObject({ ok: true, unreadCount: 0, notifications: [] });
  });
});
