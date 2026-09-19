import { readFileSync } from "node:fs";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";

// The session boundary is the only thing replaced: the route, the list and
// mark-read actions and the database are all real.
const authState: { current: { actorUserId: string; organizationId: string } | null } = { current: null };

vi.mock("../../src/lib/auth/executive-session-context", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/auth/executive-session-context")>();

  return {
    ...original,
    resolveAuthenticatedExecutiveContext: async () => {
      if (!authState.current) {
        throw new original.ExecutiveAuthenticationError("UNAUTHENTICATED", 401);
      }
      return { ...authState.current, timezone: "Europe/Istanbul", referenceTimeIso: new Date().toISOString() };
    }
  };
});

import { GET, POST } from "../../src/app/api/notifications/route";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];

async function createOrg(label: string) {
  const organizationId = `nr-org-${suffix}-${label}`;
  const userId = `nr-user-${suffix}-${label}`;
  await db.organization.create({ data: { id: organizationId, name: "Notification Route Org" } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: label } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "OWNER" } });
  createdOrgs.push(organizationId);
  createdUsers.push(userId);
  return { organizationId, userId };
}

const get = () => GET(new Request("http://localhost/api/notifications"));
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );

beforeEach(() => {
  authState.current = null;
});

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.notification.deleteMany({ where: { organizationId } });
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("notification delivery API (the toast's source)", () => {
  it("requires an authenticated session", async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect((await post({ notificationId: "x" })).status).toBe(401);
  });

  it("returns the user's own unread canonical notifications with display fields only", async () => {
    const a = await createOrg("a");
    const b = await createOrg("b");
    const own = await db.notification.create({
      data: { organizationId: a.organizationId, userId: a.userId, category: "TASKS", priority: "NORMAL", title: "Görev oluşturuldu: X", body: "Son tarih: 19 Eyl 2026 14:00", sourceType: "Task", sourceId: "task-internal-id-123" }
    });
    await db.notification.create({
      data: { organizationId: b.organizationId, userId: b.userId, category: "TASKS", priority: "NORMAL", title: "Başka tenant" }
    });
    await db.notification.create({
      data: { organizationId: a.organizationId, userId: a.userId, category: "SALES", priority: "NORMAL", title: "Zaten okundu", readAt: new Date() }
    });

    authState.current = { actorUserId: a.userId, organizationId: a.organizationId };
    const payload = await (await get()).json();

    expect(payload.ok).toBe(true);
    expect(payload.unreadCount).toBe(1);
    expect(payload.notifications).toHaveLength(1);
    expect(payload.notifications[0]).toEqual({
      id: own.id,
      category: "TASKS",
      priority: "NORMAL",
      title: "Görev oluşturuldu: X",
      body: "Son tarih: 19 Eyl 2026 14:00",
      createdAt: own.createdAt.toISOString()
    });

    // No internal reference, tenant or user id leaks into the payload.
    const serialized = JSON.stringify(payload);
    for (const secret of ["task-internal-id-123", a.organizationId, a.userId, b.userId, "sourceId", "sourceType", "Başka tenant"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("marks read: the notification leaves the unread feed, and the mark is idempotent", async () => {
    const a = await createOrg("read");
    const note = await db.notification.create({
      data: { organizationId: a.organizationId, userId: a.userId, category: "FINANCE", priority: "HIGH", title: "Tahsilat kaydedildi" }
    });
    authState.current = { actorUserId: a.userId, organizationId: a.organizationId };

    expect((await post({ notificationId: note.id })).status).toBe(200);
    expect((await post({ notificationId: note.id })).status).toBe(200);

    const payload = await (await get()).json();
    expect(payload.unreadCount).toBe(0);
    expect(payload.notifications).toEqual([]);
    expect((await db.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).not.toBeNull();
  });

  it("tenant/user isolation: a user cannot mark another user's or tenant's notification read", async () => {
    const a = await createOrg("iso-a");
    const b = await createOrg("iso-b");
    const foreign = await db.notification.create({
      data: { organizationId: b.organizationId, userId: b.userId, category: "TASKS", priority: "NORMAL", title: "B'nin bildirimi" }
    });

    authState.current = { actorUserId: a.userId, organizationId: a.organizationId };
    const response = await post({ notificationId: foreign.id });

    expect(response.status).toBe(404);
    expect((await response.json()).ok).toBe(false);
    expect((await db.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();
  });

  it("rejects malformed requests without touching anything", async () => {
    const a = await createOrg("bad");
    authState.current = { actorUserId: a.userId, organizationId: a.organizationId };

    expect((await post("not json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ notificationId: "x", extra: true })).status).toBe(400);
  });
});

describe("notification toast delivery surface", () => {
  const toast = readFileSync("src/components/living-workspace/MetrixNotificationToast.tsx", "utf8");
  const shell = readFileSync("src/components/living-workspace/ExecutiveAppShell.tsx", "utf8");
  const conversation = readFileSync("src/components/metrix-conversation/MetrixConversation.tsx", "utf8");

  it("is mounted in the app shell and fed by the notification API (poll, focus, after each turn)", () => {
    expect(shell).toContain("<MetrixNotificationToast />");
    expect(toast).toContain('"/api/notifications"');
    expect(toast).toContain("setInterval");
    expect(toast).toContain('addEventListener("focus"');
    expect(conversation).toContain('"metrix:notifications-refresh"');
    expect(toast).toContain('"metrix:notifications-refresh"');
  });

  it("renders only display fields: never an id, source reference or error text", () => {
    // JSX text expressions only; `key={item.id}` is a React key, not rendered text.
    const renderedFields = toast
      .split("\n")
      .filter(line => /\{item\./.test(line) && !/key=\{/.test(line));
    expect(renderedFields.join("\n")).toMatch(/item\.title/);
    expect(renderedFields.join("\n")).toMatch(/item\.body/);

    for (const line of renderedFields) {
      expect(line).not.toMatch(/item\.id|sourceId|sourceType|error/i);
    }
    // The id is used only as a React key and for the mark-read call.
    expect(toast).toMatch(/key=\{item\.id\}/);
  });
});
