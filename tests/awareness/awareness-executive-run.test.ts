import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("@openai/agents", async () => {
  const actual = await vi.importActual<typeof import("@openai/agents")>("@openai/agents");

  return { ...actual, run: mocks.run };
});


import { db } from "../../src/lib/db";
import { runMetrixExecutiveTurn } from "../../src/lib/agent/metrix-executive-agent";
import { executeMetrixBusinessTool } from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import {
  listDeliverableNotifications,
  updateNotificationPreferences
} from "../../src/lib/notifications/notification-preferences";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function createOrgWithUser() {
  counter += 1;
  const organizationId = `aw-run-org-${suffix}-${counter}`;
  const userId = `aw-run-user-${suffix}-${counter}`;

  await db.organization.create({ data: { id: organizationId, name: "Awareness Run Tenant" } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "User" } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "OWNER" } });
  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  return { organizationId, userId };
}

afterEach(async () => {
  mocks.run.mockReset();

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

describe("runMetrixExecutiveTurn with a system-event origin", () => {
  it("runs the same entry point with the trusted context, no chat session, and the narrowed toolset + system-event instructions", async () => {
    mocks.run.mockResolvedValue({ finalOutput: "Bildirim gerekmiyor.", newItems: [] });

    const result = await runMetrixExecutiveTurn({
      origin: "SYSTEM_EVENT",
      actorUserId: "user-1",
      organizationId: "org-1",
      turnId: "aw-turn-1",
      message: "[SİSTEM OLAYI — kullanıcı mesajı değil] ...",
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-19T12:00:00.000Z"
    });

    expect(mocks.run).toHaveBeenCalledTimes(1);

    const [agent, input, options] = mocks.run.mock.calls[0] as [
      { name: string; instructions: string; tools: Array<{ name: string }> },
      string,
      { session?: unknown; context: unknown }
    ];

    expect(agent.name).toBe("METRIX");
    expect(agent.instructions).toContain("KULLANICI MESAJI DEĞİL");
    expect(agent.tools.map(tool => tool.name)).not.toContain("mail_send");
    expect(agent.tools.map(tool => tool.name)).toContain("notification_create");
    expect(input).toContain("SİSTEM OLAYI");
    expect(options.session).toBeUndefined();
    expect(options.context).toEqual({
      actorUserId: "user-1",
      organizationId: "org-1",
      turnId: "aw-turn-1",
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-19T12:00:00.000Z"
    });
    expect(result.finalOutput).toBe("Bildirim gerekmiyor.");
    expect(result.openAiConversationId).toBe("");
  });

  it("a person's turn is unchanged: full toolset, no system-event instructions, native session", async () => {
    mocks.run.mockResolvedValue({ finalOutput: "Tamam.", newItems: [] });

    await runMetrixExecutiveTurn({
      actorUserId: "user-1",
      organizationId: "org-1",
      turnId: "user-turn-1",
      message: "Merhaba",
      openAiConversationId: "conv_existing"
    });

    const [agent, , options] = mocks.run.mock.calls[0] as [
      { instructions: string; tools: Array<{ name: string }> },
      string,
      { session?: unknown }
    ];

    expect(agent.instructions).not.toContain("KULLANICI MESAJI DEĞİL");
    expect(agent.tools.map(tool => tool.name)).toContain("mail_send");
    expect(options.session).toBeDefined();
  });
});

describe("the Executive's notification through the canonical notification_create", () => {
  const context = (userId: string, organizationId: string, turnId: string) => ({
    actorUserId: userId,
    organizationId,
    idempotencyScope: `turn:${turnId}`,
    timezone: "Europe/Istanbul",
    referenceTimeIso: new Date().toISOString()
  });

  const notify = (ctx: ReturnType<typeof context>, overrides: Record<string, unknown> = {}) =>
    executeMetrixBusinessTool({
      name: "notification_create",
      argumentsJson: JSON.stringify({
        category: "TASKS",
        priority: "HIGH",
        title: "Teklif görevi gecikti",
        body: "Ahmet'e gidecek teklif hâlâ bekliyor.",
        sourceType: "Task",
        sourceId: "task-1",
        ...overrides
      }),
      context: ctx
    }) as Promise<{ replayed: boolean; notification: { id: string; category: string } }>;

  it("a re-run of the same event (same derived turn id) reuses the notification instead of stacking a second", async () => {
    const { organizationId, userId } = await createOrgWithUser();
    const ctx = context(userId, organizationId, "aw-fixed-event-identity");

    const first = await notify(ctx);
    const second = await notify(ctx);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.notification.id).toBe(first.notification.id);
    expect(await db.notification.count({ where: { organizationId, userId } })).toBe(1);
  });

  it("stores the canonical category whatever case the model wrote, so the user's preference applies", async () => {
    const { organizationId, userId } = await createOrgWithUser();

    const created = await notify(context(userId, organizationId, "aw-cat-1"), { category: "finance" });
    expect(created.notification.category).toBe("FINANCE");

    // Finance switched off: the notification exists, but is not delivered proactively.
    await updateNotificationPreferences({ actorUserId: userId, patch: { finance: false } });

    expect(await db.notification.count({ where: { organizationId, userId, category: "FINANCE" } })).toBe(1);
    const delivered = await listDeliverableNotifications({ userId, organizationId });
    expect(delivered.notifications.map(item => item.id)).not.toContain(created.notification.id);

    // A category the user left on is delivered.
    const tasks = await notify(context(userId, organizationId, "aw-cat-2"), { category: "Tasks" });
    const afterTasks = await listDeliverableNotifications({ userId, organizationId });
    expect(afterTasks.notifications.map(item => item.id)).toContain(tasks.notification.id);
  });

  it("mute-all silences delivery of an Executive notification without deleting it", async () => {
    const { organizationId, userId } = await createOrgWithUser();
    await notify(context(userId, organizationId, "aw-mute-1"), { category: "CRITICAL" });

    await updateNotificationPreferences({ actorUserId: userId, patch: { muteAll: true } });

    expect(await db.notification.count({ where: { organizationId, userId } })).toBe(1);
    expect(await listDeliverableNotifications({ userId, organizationId })).toEqual({ notifications: [], unreadCount: 0 });
  });
});

