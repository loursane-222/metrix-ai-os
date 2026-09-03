import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCalendarEventMock } = vi.hoisted(() => ({ createCalendarEventMock: vi.fn() }));
vi.mock("@/lib/core/calendar/calendar-event.service", () => ({ createCalendarEvent: createCalendarEventMock }));

import { calendarEventCreateHandler } from "../calendar-event-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "calendar_event.create",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: [], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("calendarEventCreateHandler", () => {
  beforeEach(() => {
    createCalendarEventMock.mockReset();
  });

  it("creates an event through the canonical service, stamping performedById from the actor", async () => {
    createCalendarEventMock.mockResolvedValue({ id: "evt-1", title: "Toplantı", startAt: new Date("2026-02-01T10:00:00Z"), endAt: new Date("2026-02-01T11:00:00Z") });
    const result = await calendarEventCreateHandler(envelope({ title: "Toplantı", startAt: "2026-02-01T10:00:00Z", endAt: "2026-02-01T11:00:00Z" }));
    expect(createCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", title: "Toplantı", performedById: "actor-1" }));
    expect(result.status).toBe("SUCCESS");
    expect(result.entityRef).toEqual({ entityType: "calendar_event", entityId: "evt-1" });
  });

  it("rejects an invalid startAt before calling the service", async () => {
    await expect(calendarEventCreateHandler(envelope({ title: "X", startAt: "not-a-date", endAt: "2026-02-01T11:00:00Z" }))).rejects.toThrow(/startAt/);
    expect(createCalendarEventMock).not.toHaveBeenCalled();
  });

  it("rejects a missing title", async () => {
    await expect(calendarEventCreateHandler(envelope({ startAt: "2026-02-01T10:00:00Z", endAt: "2026-02-01T11:00:00Z" }))).rejects.toThrow(/title/);
  });
});
