import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { executeMetrixBusinessTool } from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import {
  NOTIFICATION_CATEGORY,
  draftForVerifiedResult,
  emitBusinessEventNotifications
} from "../../src/lib/notifications/business-event-notifications";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const TZ = "Europe/Istanbul";

const verified = (extra: Record<string, unknown>) => ({
  status: "VERIFIED",
  verified: true,
  replayed: false,
  ...extra
});

describe("notification policy — which canonical business events notify, and how", () => {
  const cases: Array<{
    name: string;
    result: Record<string, unknown>;
    category: string;
    priority: string;
    title: RegExp;
    body?: RegExp;
  }> = [
    {
      name: "task_create",
      result: verified({ action: "task.create", task: { id: "t1", title: "Ahmet'i ara", priority: "MEDIUM", status: "OPEN", dueAt: "2026-09-19T11:00:00.000Z", assignedToUserId: null } }),
      category: NOTIFICATION_CATEGORY.TASKS,
      priority: "NORMAL",
      title: /^Görev oluşturuldu: Ahmet'i ara$/,
      body: /Son tarih: .*14:00/
    },
    {
      name: "task_create",
      result: verified({ action: "task.create", task: { id: "t2", title: "Acil", priority: "HIGH", status: "OPEN", dueAt: null, assignedToUserId: null } }),
      category: NOTIFICATION_CATEGORY.TASKS,
      priority: "HIGH",
      title: /^Görev oluşturuldu: Acil$/
    },
    {
      name: "task_update",
      result: verified({ action: "task.update", task: { id: "t1", title: "Ahmet'i ara", priority: "MEDIUM", status: "DONE", dueAt: null } }),
      category: NOTIFICATION_CATEGORY.TASKS,
      priority: "NORMAL",
      title: /^Görev tamamlandı: Ahmet'i ara$/
    },
    {
      name: "customer_create",
      result: verified({ action: "customer.create", customer: { id: "c1", name: "Atlas İnşaat" } }),
      category: NOTIFICATION_CATEGORY.SALES,
      priority: "NORMAL",
      title: /^Yeni müşteri: Atlas İnşaat$/
    },
    {
      name: "quote_create",
      result: verified({ action: "quote.create", quote: { id: "q1", customerName: "Atlas İnşaat", title: "Kolon", amount: 1500, currency: "TRY", status: "DRAFT" } }),
      category: NOTIFICATION_CATEGORY.SALES,
      priority: "NORMAL",
      title: /^Teklif oluşturuldu: Atlas İnşaat — Kolon$/,
      body: /^Tutar: /
    },
    {
      name: "quote_mark_won",
      result: verified({ action: "quote.mark_won", quote: { id: "q1", customerName: "Atlas İnşaat", title: "Kolon", amount: 1500, currency: "TRY", status: "WON" } }),
      category: NOTIFICATION_CATEGORY.SALES,
      priority: "HIGH",
      title: /^Teklif kazanıldı: Atlas İnşaat — Kolon$/
    },
    {
      name: "order_create_from_quote",
      result: verified({ action: "order.create_from_quote", order: { id: "o1", orderNumber: "SIP-1", customerName: "Atlas İnşaat", amount: 1500, currency: "TRY", status: "DRAFT" } }),
      category: NOTIFICATION_CATEGORY.SALES,
      priority: "NORMAL",
      title: /^Sipariş oluşturuldu: SIP-1$/
    },
    {
      name: "invoice_create_from_order",
      result: verified({ action: "invoice.create_from_order", invoice: { id: "i1", invoiceNumber: "FAT-1", totalAmount: 1800, currency: "TRY", status: "DRAFT" } }),
      category: NOTIFICATION_CATEGORY.FINANCE,
      priority: "NORMAL",
      title: /^Fatura oluşturuldu: FAT-1$/,
      body: /^Toplam: /
    },
    {
      name: "collection_record",
      result: verified({ action: "collection.record", collection: { settlementId: "s1", amount: 500, currency: "TRY", outstanding: 1300 } }),
      category: NOTIFICATION_CATEGORY.FINANCE,
      priority: "HIGH",
      title: /^Tahsilat kaydedildi: /,
      body: /^Kalan bakiye: /
    }
  ];

  it.each(cases)("$name → $category / $priority notification", ({ name, result, category, priority, title, body }) => {
    const draft = draftForVerifiedResult(name, result, TZ);

    expect(draft).not.toBeNull();
    expect(draft!.category).toBe(category);
    expect(draft!.priority).toBe(priority);
    expect(draft!.title).toMatch(title);
    if (body) expect(draft!.body ?? "").toMatch(body);
    // Internal ids are the dedupe/source references only — never in text.
    for (const id of ["t1", "t2", "c1", "q1", "o1", "i1", "s1"]) {
      expect(draft!.title).not.toContain(`:${id}`);
    }
    expect(draft!.eventKey.length).toBeGreaterThan(0);
  });

  it.each([
    ["task_update", verified({ task: { id: "t1", title: "x", status: "OPEN" } })],
    ["task_update", verified({ task: { id: "t1", title: "x", status: "CANCELLED" } })],
    ["task_list", verified({ tasks: [] })],
    ["customer_lookup", { source: "COMPANY_REALITY", customers: [] }],
    ["calendar_create", verified({ event: { id: "e1", title: "Toplantı" } })],
    ["calendar_list", { events: [] }],
    ["mail_send", verified({ message: { to: "a@b.c", subject: "s" } })],
    ["notification_create", verified({ notification: { id: "n1" } })],
    ["integration_status", { connected: true }]
  ])("%s does not notify (reads, drafts of a change and self-authored entries are not events)", (name, result) => {
    expect(draftForVerifiedResult(name, result, TZ)).toBeNull();
  });
});

describe("notification emission — real persistence, recipients, dedupe, no false notifications", () => {
  const createdOrgs: string[] = [];
  const createdUsers: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });

  afterEach(async () => {
    for (const organizationId of createdOrgs.splice(0)) {
      await db.notification.deleteMany({ where: { organizationId } });
      await db.actionExecution.deleteMany({ where: { organizationId } });
      await db.task.deleteMany({ where: { organizationId } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
    for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
  });

  afterAll(async () => {
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
    await db.$disconnect();
  });

  async function createOrg(label: string) {
    const organizationId = `bn-org-${suffix}-${label}`;
    await db.organization.create({ data: { id: organizationId, name: "Notification Org" } });
    createdOrgs.push(organizationId);

    const roles = ["OWNER", "ADMIN", "MEMBER", "MEMBER"] as const;
    const users: Record<string, string> = {};

    for (const [index, role] of roles.entries()) {
      const key = ["owner", "admin", "member", "other"][index]!;
      const userId = `bn-user-${suffix}-${label}-${key}`;
      await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: key } });
      await db.organizationMember.create({ data: { organizationId, userId, role } });
      createdUsers.push(userId);
      users[key] = userId;
    }

    return { organizationId, users: users as { owner: string; admin: string; member: string; other: string } };
  }

  let turn = 0;
  function context(organizationId: string, actorUserId: string, scope?: string) {
    turn += 1;
    return {
      actorUserId,
      organizationId,
      idempotencyScope: scope ?? `turn:bn-${suffix}-${turn}`,
      timezone: TZ,
      referenceTimeIso: "2026-09-18T09:00:00.000Z"
    };
  }

  const notificationsOf = (organizationId: string) =>
    db.notification.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });

  it("a verified task_create notifies the actor and the org's owners/admins in the TASKS category — org/user correct, no other tenant", async () => {
    const org = await createOrg("task");
    const outsider = await createOrg("outsider");

    await executeMetrixBusinessTool({
      name: "task_create",
      argumentsJson: JSON.stringify({ title: "Ahmet'i ara", dueAt: "2026-09-19T14:00:00+03:00" }),
      context: context(org.organizationId, org.users.member)
    });

    const rows = await notificationsOf(org.organizationId);
    const recipients = rows.map(row => row.userId).sort();

    // actor (member) + owner + admin; the other plain member and the other
    // tenant are not notified.
    expect(recipients).toEqual([org.users.admin, org.users.member, org.users.owner].sort());
    for (const row of rows) {
      expect(row).toMatchObject({ organizationId: org.organizationId, category: "TASKS", priority: "NORMAL", readAt: null });
      expect(row.title).toBe("Görev oluşturuldu: Ahmet'i ara");
      expect(row.body).toMatch(/14:00/);
    }
    expect(await db.notification.count({ where: { organizationId: outsider.organizationId } })).toBe(0);
  });

  it("a task assigned to another member also notifies that assignee", async () => {
    const org = await createOrg("assign");

    await emitBusinessEventNotifications({
      name: "task_create",
      result: verified({ task: { id: "task-assign-1", title: "Devret", priority: "MEDIUM", status: "OPEN", dueAt: null, assignedToUserId: org.users.other } }),
      context: { actorUserId: org.users.owner, organizationId: org.organizationId, timezone: TZ }
    });

    const recipients = (await notificationsOf(org.organizationId)).map(row => row.userId);
    expect(recipients).toContain(org.users.other);
    expect(recipients).toContain(org.users.owner);
  });

  it("an assignee from another organization is never notified", async () => {
    const org = await createOrg("xt-a");
    const foreign = await createOrg("xt-b");

    await emitBusinessEventNotifications({
      name: "task_create",
      result: verified({ task: { id: "task-x-1", title: "Sızmasın", priority: "MEDIUM", status: "OPEN", dueAt: null, assignedToUserId: foreign.users.owner } }),
      context: { actorUserId: org.users.owner, organizationId: org.organizationId, timezone: TZ }
    });

    expect(await db.notification.count({ where: { userId: foreign.users.owner } })).toBe(0);
    expect(await db.notification.count({ where: { organizationId: foreign.organizationId } })).toBe(0);
  });

  it("customer_create through the runtime produces a SALES notification", async () => {
    const org = await createOrg("customer");

    await executeMetrixBusinessTool({
      name: "customer_create",
      argumentsJson: JSON.stringify({ name: "Atlas İnşaat" }),
      context: context(org.organizationId, org.users.owner)
    });

    const rows = await notificationsOf(org.organizationId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.category === "SALES" && row.title === "Yeni müşteri: Atlas İnşaat")).toBe(true);
  });

  it("finance events (invoice, collection) persist FINANCE notifications for the right recipients", async () => {
    const org = await createOrg("finance");
    const base = { actorUserId: org.users.admin, organizationId: org.organizationId, timezone: TZ };

    await emitBusinessEventNotifications({
      name: "invoice_create_from_order",
      result: verified({ invoice: { id: "inv-1", invoiceNumber: "FAT-9", totalAmount: 1200, currency: "TRY" } }),
      context: base
    });
    await emitBusinessEventNotifications({
      name: "collection_record",
      result: verified({ collection: { settlementId: "set-1", amount: 400, currency: "TRY", outstanding: 800 } }),
      context: base
    });

    const rows = await notificationsOf(org.organizationId);
    expect(rows.every(row => row.category === "FINANCE")).toBe(true);
    expect(rows.filter(row => row.title.startsWith("Tahsilat")).every(row => row.priority === "HIGH")).toBe(true);
    expect(new Set(rows.map(row => row.userId))).toEqual(new Set([org.users.owner, org.users.admin]));
  });

  it("a retried or replayed mutation never stacks a duplicate notification", async () => {
    const org = await createOrg("dedupe");
    const same = context(org.organizationId, org.users.owner);
    const args = JSON.stringify({ title: "Bir kez", dueAt: "2026-09-19T14:00:00+03:00" });

    await executeMetrixBusinessTool({ name: "task_create", argumentsJson: args, context: same });
    const afterFirst = await db.notification.count({ where: { organizationId: org.organizationId } });

    const replay = (await executeMetrixBusinessTool({ name: "task_create", argumentsJson: args, context: same })) as { replayed: boolean };
    expect(replay.replayed).toBe(true);

    // Emitting the same verified event again (a retry, a second path) is
    // also a no-op: the dedupe identity is the business event + recipient.
    const task = await db.task.findFirstOrThrow({ where: { organizationId: org.organizationId } });
    for (let index = 0; index < 3; index += 1) {
      await emitBusinessEventNotifications({
        name: "task_create",
        result: verified({ task: { id: task.id, title: "Bir kez", priority: "MEDIUM", status: "OPEN", dueAt: task.dueAt?.toISOString() ?? null, assignedToUserId: task.assignedToUserId } }),
        context: { actorUserId: org.users.owner, organizationId: org.organizationId, timezone: TZ }
      });
    }

    expect(afterFirst).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { organizationId: org.organizationId } })).toBe(afterFirst);
    expect(await db.actionExecution.count({ where: { organizationId: org.organizationId, actionType: "notification.create" } })).toBe(afterFirst);
  });

  it("a completed task notifies once, even if it is marked done repeatedly", async () => {
    const org = await createOrg("done");
    const created = (await executeMetrixBusinessTool({
      name: "task_create",
      argumentsJson: JSON.stringify({ title: "Bitir" }),
      context: context(org.organizationId, org.users.owner)
    })) as { task: { id: string } };

    for (let index = 0; index < 2; index += 1) {
      await executeMetrixBusinessTool({
        name: "task_update",
        argumentsJson: JSON.stringify({ taskId: created.task.id, status: "DONE" }),
        context: context(org.organizationId, org.users.owner)
      });
    }

    const done = (await notificationsOf(org.organizationId)).filter(row => row.title === "Görev tamamlandı: Bitir");
    expect(done.map(row => row.userId).sort()).toEqual([org.users.admin, org.users.owner].sort());
  });

  it("a failed mutation produces no notification (no false 'işlem tamamlandı')", async () => {
    const org = await createOrg("failed");

    // Invalid input: the mutation throws, so nothing is emitted.
    await expect(
      executeMetrixBusinessTool({
        name: "task_create",
        argumentsJson: JSON.stringify({ title: "", dueAt: "2026-09-19T14:00:00+03:00" }),
        context: context(org.organizationId, org.users.owner)
      })
    ).rejects.toThrow();

    // A mutation on something that does not exist fails the same way.
    await expect(
      executeMetrixBusinessTool({
        name: "task_update",
        argumentsJson: JSON.stringify({ taskId: "does-not-exist", status: "DONE" }),
        context: context(org.organizationId, org.users.owner)
      })
    ).rejects.toThrow();

    expect(await db.notification.count({ where: { organizationId: org.organizationId } })).toBe(0);
    expect(await db.task.count({ where: { organizationId: org.organizationId } })).toBe(0);
  });

  it("an unverified or non-mutation result never notifies", async () => {
    const org = await createOrg("unverified");
    const base = { actorUserId: org.users.owner, organizationId: org.organizationId, timezone: TZ };
    const task = { id: "t-x", title: "Hayır", priority: "MEDIUM", status: "OPEN", dueAt: null, assignedToUserId: null };

    await emitBusinessEventNotifications({ name: "task_create", result: { status: "PENDING", verified: false, task }, context: base });
    await emitBusinessEventNotifications({ name: "task_create", result: { task }, context: base });
    await emitBusinessEventNotifications({ name: "task_list", result: verified({ tasks: [task] }), context: base });
    await emitBusinessEventNotifications({ name: "task_create", result: "An error occurred", context: base });

    expect(await db.notification.count({ where: { organizationId: org.organizationId } })).toBe(0);
  });

  it("a notification problem never fails the business mutation that already committed", async () => {
    const org = await createOrg("contained");

    // An actor that is not a member cannot notify; emission must swallow it
    // rather than throw (the mutation path never reaches this with a bad
    // actor, so call the emitter directly with an unresolvable context).
    await expect(
      emitBusinessEventNotifications({
        name: "task_create",
        result: verified({ task: { id: "t-c", title: "x", priority: "MEDIUM", status: "OPEN", dueAt: null, assignedToUserId: null } }),
        context: { actorUserId: "not-a-real-user", organizationId: org.organizationId, timezone: TZ }
      })
    ).resolves.toBeUndefined();
  });
});
