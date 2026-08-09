import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { calendarEvent: { findMany } } }));

import { computeAvailability, computeDailyCapacity, computeExecutiveRhythm, detectConflicts } from "../calendar-intelligence.service";

describe("calendar intelligence", () => {
  beforeEach(() => findMany.mockReset());
  afterEach(() => vi.useRealTimers());

  it("detects the same participant and excludes different participants", async () => {
    const event = { id: "event-1", title: "Toplantı", startAt: new Date("2026-08-09T10:00:00Z"), endAt: new Date("2026-08-09T11:00:00Z"), blockType: "MEETING", participants: [{ memberId: "member-1", customerId: null }] };
    findMany.mockResolvedValueOnce([event]).mockResolvedValueOnce([]);
    const input = { organizationId: "org-1", startAt: new Date("2026-08-09T10:30:00Z"), endAt: new Date("2026-08-09T11:30:00Z"), participantMemberIds: ["member-1"], participantCustomerIds: [] };

    expect(await detectConflicts(input)).toEqual([event]);
    expect(await detectConflicts({ ...input, participantMemberIds: ["member-2"] })).toEqual([]);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { organizationId: "org-1", participants: { some: { OR: [{ memberId: { in: ["member-1"] } }] } } } });
  });

  it("excludes cancelled events and treats touching boundaries as non-conflicting", async () => {
    findMany.mockResolvedValue([]);
    const startAt = new Date("2026-08-09T11:00:00Z");
    const endAt = new Date("2026-08-09T12:00:00Z");
    await detectConflicts({ organizationId: "org-1", startAt, endAt, participantMemberIds: ["member-1"], participantCustomerIds: [] });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: "CANCELLED" }, startAt: { lt: endAt }, endAt: { gt: startAt } }) }));
  });

  it.each([
    ["FOCUS_TIME", "Odaklanıyor"],
    [null, "Meşgul"],
  ])("maps an active %s block to availability", async (blockType, label) => {
    findMany.mockResolvedValue([{ id: "event-1", title: "Çalışma", startAt: new Date(), endAt: new Date(), blockType }]);
    expect(await computeAvailability("member-1", "org-1", new Date("2026-08-09T10:30:00Z"))).toMatchObject({ status: "BUSY", label });
  });

  it("reports available when there is no active event", async () => {
    findMany.mockResolvedValue([]);
    expect(await computeAvailability("member-1", "org-1", new Date("2026-08-09T10:30:00Z"))).toMatchObject({ status: "AVAILABLE", label: "Müsait" });
  });

  it("sums clipped event minutes against the explicit 480 minute capacity", async () => {
    findMany.mockResolvedValue([
      { startAt: new Date("2026-08-09T08:00:00"), endAt: new Date("2026-08-09T10:00:00") },
      { startAt: new Date("2026-08-09T11:00:00"), endAt: new Date("2026-08-09T12:00:00") },
    ]);
    expect(await computeDailyCapacity("member-1", "org-1", new Date("2026-08-09T15:00:00"))).toMatchObject({ scheduledMinutes: 180, defaultCapacityMinutes: 480, utilizationPercent: 38 });
  });

  it("stays silent when a rhythm sample occurs fewer than three times", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    findMany.mockResolvedValue([
      { title: "Haftalık değerlendirme", startAt: new Date("2026-07-27T09:00:00Z"), blockType: "MEETING" },
      { title: "Haftalık değerlendirme", startAt: new Date("2026-08-03T09:00:00Z"), blockType: "MEETING" },
    ]);
    expect((await computeExecutiveRhythm("member-1", "org-1")).notes.every((note) => note === null)).toBe(true);
  });
});
