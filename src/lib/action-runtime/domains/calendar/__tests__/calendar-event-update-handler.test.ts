import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCalendarEventMock, updateCalendarEventDetailsMock } = vi.hoisted(() => ({
  getCalendarEventMock: vi.fn(),
  updateCalendarEventDetailsMock: vi.fn(),
}));
vi.mock("@/lib/core/calendar/calendar-event.service", () => ({
  getCalendarEvent: getCalendarEventMock,
  updateCalendarEventDetails: updateCalendarEventDetailsMock,
}));

import { calendarEventUpdateHandler } from "../calendar-event-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "calendar_event.update",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: [], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("calendarEventUpdateHandler", () => {
  beforeEach(() => {
    getCalendarEventMock.mockReset();
    updateCalendarEventDetailsMock.mockReset();
  });

  it("patches only the addressed fields and captures a reverse-patch compensation snapshot", async () => {
    getCalendarEventMock.mockResolvedValue({ id: "evt-1", title: "Eski Başlık", description: "d", allDay: false });
    updateCalendarEventDetailsMock.mockResolvedValue({ id: "evt-1", title: "Yeni Başlık" });
    const result = await calendarEventUpdateHandler(envelope({ eventId: "evt-1", title: "Yeni Başlık" }));
    expect(updateCalendarEventDetailsMock).toHaveBeenCalledWith({ eventId: "evt-1", organizationId: "org-1", title: "Yeni Başlık", description: undefined, allDay: undefined });
    expect(result.metadata?.changedFields).toEqual(["title"]);
    expect(result.compensationSnapshot).toEqual({ eventId: "evt-1", title: "Eski Başlık" });
  });

  it("rejects when the event does not exist", async () => {
    getCalendarEventMock.mockResolvedValue(null);
    await expect(calendarEventUpdateHandler(envelope({ eventId: "missing", title: "X" }))).rejects.toThrow(/not found/);
    expect(updateCalendarEventDetailsMock).not.toHaveBeenCalled();
  });

  it("rejects when no updatable field is provided", async () => {
    await expect(calendarEventUpdateHandler(envelope({ eventId: "evt-1" }))).rejects.toThrow(/At least one/);
  });
});
