import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(process.cwd(), "src/lib/actions/calendar-event.ts");

const implementationExists = existsSync(implementationPath);

describe("verified calendar.create / calendar.update actions", () => {
  it("requires the typed calendar-event implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("rejects an event whose end precedes its start", async () => {
    if (!implementationExists) return;

    const { createCalendarEvent } = await import("../../src/lib/actions/calendar-event");

    await expect(createCalendarEvent({
      actorUserId: "user", organizationId: "org", idempotencyKey: "key",
      title: "Test", startsAt: "2026-09-17T15:00:00.000Z", endsAt: "2026-09-17T14:00:00.000Z"
    })).rejects.toMatchObject({ code: "INVALID_CALENDAR_RANGE" });
  });

  it("authorizes, creates once idempotently, rejects conflicting replays and cross-tenant access, then reschedules idempotently with verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      createCalendarEvent,
      updateCalendarEvent,
      listCalendarEvents
    } = await import("../../src/lib/actions/calendar-event");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `cal-org-${suffix}`;
    const otherOrgId = `cal-other-org-${suffix}`;
    const userId = `cal-user-${suffix}`;
    const otherOrgUserId = `cal-other-org-user-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Calendar Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.test`, name: "Calendar User" },
        { id: otherOrgUserId, email: `${otherOrgUserId}@example.test`, name: "Other Org User" }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        { organizationId, userId, role: "MEMBER" },
        { organizationId: otherOrgId, userId: otherOrgUserId, role: "MEMBER" }
      ]
    });

    try {
      const idempotencyKey = `create-${suffix}`;

      const first = await createCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        title: "Ahmet ile toplantı",
        startsAt: "2026-09-17T14:00:00.000Z",
        endsAt: "2026-09-17T14:30:00.000Z"
      });

      expect(first.action).toBe("calendar.create");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.event.title).toBe("Ahmet ile toplantı");
      expect(first.event.startsAt).toBe("2026-09-17T14:00:00.000Z");
      expect(first.event.endsAt).toBe("2026-09-17T14:30:00.000Z");
      expect(first.event.allDay).toBe(false);

      const eventId = first.event.id;

      const persisted = await db.calendarEvent.findUnique({ where: { id: eventId } });
      expect(persisted?.organizationId).toBe(organizationId);
      expect(persisted?.userId).toBe(userId);

      // --- exact replay: same idempotencyKey, same payload ---
      const replay = await createCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        title: "Ahmet ile toplantı",
        startsAt: "2026-09-17T14:00:00.000Z",
        endsAt: "2026-09-17T14:30:00.000Z"
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.event.id).toBe(eventId);

      const eventCount = await db.calendarEvent.count({ where: { organizationId, title: "Ahmet ile toplantı" } });
      expect(eventCount).toBe(1);

      // --- same idempotency key, conflicting payload ---
      await expect(createCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        title: "Farklı toplantı",
        startsAt: "2026-09-18T09:00:00.000Z",
        endsAt: "2026-09-18T09:30:00.000Z"
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

      const stillOneEvent = await db.calendarEvent.count({ where: { organizationId } });
      expect(stillOneEvent).toBe(1);

      // --- cross-tenant creator cannot act on the authorized org ---
      await expect(createCalendarEvent({
        actorUserId: otherOrgUserId,
        organizationId,
        idempotencyKey: `cross-tenant-create-${suffix}`,
        title: "İzinsiz etkinlik",
        startsAt: "2026-09-19T09:00:00.000Z",
        endsAt: "2026-09-19T09:30:00.000Z"
      })).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });

      const noUnauthorizedEvent = await db.calendarEvent.count({ where: { organizationId, title: "İzinsiz etkinlik" } });
      expect(noUnauthorizedEvent).toBe(0);

      const createExecution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "calendar.create",
            idempotencyKey
          }
        }
      });

      expect(createExecution?.status).toBe("VERIFIED");
      expect(createExecution?.resourceId).toBe(eventId);
      expect(createExecution?.verifiedAt).not.toBeNull();

      // --- reschedule (update) with verified readback ---
      const updateKey = `update-${suffix}`;

      const updated = await updateCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey: updateKey,
        eventId,
        startsAt: "2026-09-17T15:00:00.000Z",
        endsAt: "2026-09-17T15:30:00.000Z"
      });

      expect(updated.action).toBe("calendar.update");
      expect(updated.status).toBe("VERIFIED");
      expect(updated.verified).toBe(true);
      expect(updated.replayed).toBe(false);
      expect(updated.event.startsAt).toBe("2026-09-17T15:00:00.000Z");
      expect(updated.event.endsAt).toBe("2026-09-17T15:30:00.000Z");
      expect(updated.event.title).toBe("Ahmet ile toplantı");

      const rescheduled = await db.calendarEvent.findUnique({ where: { id: eventId } });
      expect(rescheduled?.startsAt.toISOString()).toBe("2026-09-17T15:00:00.000Z");

      // --- update idempotency: exact replay ---
      const updateReplay = await updateCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey: updateKey,
        eventId,
        startsAt: "2026-09-17T15:00:00.000Z",
        endsAt: "2026-09-17T15:30:00.000Z"
      });

      expect(updateReplay.verified).toBe(true);
      expect(updateReplay.replayed).toBe(true);
      expect(updateReplay.event.id).toBe(eventId);

      // --- update idempotency: conflicting payload under same key ---
      await expect(updateCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey: updateKey,
        eventId,
        title: "Başka başlık"
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

      const stillOriginalTitle = await db.calendarEvent.findUnique({ where: { id: eventId } });
      expect(stillOriginalTitle?.title).toBe("Ahmet ile toplantı");

      // --- cross-tenant update rejection ---
      await expect(updateCalendarEvent({
        actorUserId: otherOrgUserId,
        organizationId: otherOrgId,
        idempotencyKey: `cross-tenant-update-${suffix}`,
        eventId,
        title: "Ele geçirilmiş"
      })).rejects.toMatchObject({ code: "CALENDAR_EVENT_NOT_FOUND" });

      const unaffectedByForeignOrg = await db.calendarEvent.findUnique({ where: { id: eventId } });
      expect(unaffectedByForeignOrg?.title).toBe("Ahmet ile toplantı");

      const updateExecution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "calendar.update",
            idempotencyKey: updateKey
          }
        }
      });

      expect(updateExecution?.status).toBe("VERIFIED");
      expect(updateExecution?.resourceId).toBe(eventId);
      expect(updateExecution?.verifiedAt).not.toBeNull();

      // --- list tenant isolation + time-window behavior ---
      const otherEvent = await createCalendarEvent({
        actorUserId: otherOrgUserId,
        organizationId: otherOrgId,
        idempotencyKey: `create-other-${suffix}`,
        title: "Diğer kiracının etkinliği",
        startsAt: "2026-09-17T15:00:00.000Z",
        endsAt: "2026-09-17T15:30:00.000Z"
      });

      const secondEvent = await createCalendarEvent({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-second-${suffix}`,
        title: "Gelecek hafta etkinliği",
        startsAt: "2026-09-25T10:00:00.000Z",
        endsAt: "2026-09-25T10:30:00.000Z"
      });

      const allEvents = await listCalendarEvents({ actorUserId: userId, organizationId });
      const allIds = allEvents.map(event => event.id);
      expect(allIds).toContain(eventId);
      expect(allIds).toContain(secondEvent.event.id);
      expect(allIds).not.toContain(otherEvent.event.id);

      const windowed = await listCalendarEvents({
        actorUserId: userId,
        organizationId,
        startsBefore: "2026-09-18T00:00:00.000Z",
        endsAfter: "2026-09-17T00:00:00.000Z"
      });

      expect(windowed.map(event => event.id)).toEqual([eventId]);

      const otherOrgList = await listCalendarEvents({ actorUserId: otherOrgUserId, organizationId: otherOrgId });
      expect(otherOrgList.map(event => event.id)).toEqual([otherEvent.event.id]);
    } finally {
      await db.actionExecution.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.calendarEvent.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.organizationMember.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.user.deleteMany({ where: { id: { in: [userId, otherOrgUserId] } } });
      await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrgId] } } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
