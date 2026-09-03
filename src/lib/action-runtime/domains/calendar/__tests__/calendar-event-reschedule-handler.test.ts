import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCalendarEventMock, rescheduleCalendarEventMock } = vi.hoisted(() => ({
  getCalendarEventMock: vi.fn(),
  rescheduleCalendarEventMock: vi.fn(),
}));
vi.mock("@/lib/core/calendar/calendar-event.service", () => ({
  getCalendarEvent: getCalendarEventMock,
  rescheduleCalendarEvent: rescheduleCalendarEventMock,
}));

import { calendarEventRescheduleHandler } from "../calendar-event-reschedule-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "calendar_event.reschedule",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: [], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("calendarEventRescheduleHandler", () => {
  beforeEach(() => {
    getCalendarEventMock.mockReset();
    rescheduleCalendarEventMock.mockReset();
  });

  it("reschedules through the canonical service and captures the previous window for compensation", async () => {
    getCalendarEventMock.mockResolvedValue({ id: "evt-1", startAt: new Date("2026-02-01T10:00:00Z"), endAt: new Date("2026-02-01T11:00:00Z") });
    rescheduleCalendarEventMock.mockResolvedValue({ startAt: new Date("2026-02-02T10:00:00Z"), endAt: new Date("2026-02-02T11:00:00Z") });
    const result = await calendarEventRescheduleHandler(envelope({ eventId: "evt-1", startAt: "2026-02-02T10:00:00Z", endAt: "2026-02-02T11:00:00Z" }));
    expect(rescheduleCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt-1", organizationId: "org-1", performedById: "actor-1" }));
    expect(result.compensationSnapshot).toEqual({ eventId: "evt-1", startAt: "2026-02-01T10:00:00.000Z", endAt: "2026-02-01T11:00:00.000Z" });
  });

  it("rejects when the event does not exist", async () => {
    getCalendarEventMock.mockResolvedValue(null);
    await expect(calendarEventRescheduleHandler(envelope({ eventId: "missing", startAt: "2026-02-02T10:00:00Z", endAt: "2026-02-02T11:00:00Z" }))).rejects.toThrow(/not found/);
    expect(rescheduleCalendarEventMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid endAt before calling the service", async () => {
    await expect(calendarEventRescheduleHandler(envelope({ eventId: "evt-1", startAt: "2026-02-02T10:00:00Z", endAt: "nope" }))).rejects.toThrow(/endAt/);
  });
});
