import { beforeEach, describe, expect, it, vi } from "vitest";

const { transitionCalendarEventStatusMock } = vi.hoisted(() => ({ transitionCalendarEventStatusMock: vi.fn() }));
vi.mock("@/lib/core/calendar/calendar-event.service", () => ({ transitionCalendarEventStatus: transitionCalendarEventStatusMock }));

import { calendarEventStatusTransitionHandler } from "../calendar-event-status-transition-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "calendar_event.status_transition",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: [], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("calendarEventStatusTransitionHandler", () => {
  beforeEach(() => {
    transitionCalendarEventStatusMock.mockReset();
  });

  it("delegates to the canonical service, which enforces ALLOWED_TRANSITIONS", async () => {
    transitionCalendarEventStatusMock.mockResolvedValue({ status: "CONFIRMED" });
    const result = await calendarEventStatusTransitionHandler(envelope({ eventId: "evt-1", toStatus: "CONFIRMED" }));
    expect(transitionCalendarEventStatusMock).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt-1", organizationId: "org-1", toStatus: "CONFIRMED", performedById: "actor-1" }));
    expect(result.status).toBe("SUCCESS");
  });

  it("rejects an invalid toStatus before calling the service", async () => {
    await expect(calendarEventStatusTransitionHandler(envelope({ eventId: "evt-1", toStatus: "DELETED" }))).rejects.toThrow(/toStatus/);
    expect(transitionCalendarEventStatusMock).not.toHaveBeenCalled();
  });

  it("propagates a disallowed-transition error from the canonical service unchanged", async () => {
    transitionCalendarEventStatusMock.mockRejectedValue(new Error("Transition from CANCELLED to CONFIRMED is not permitted."));
    await expect(calendarEventStatusTransitionHandler(envelope({ eventId: "evt-1", toStatus: "CONFIRMED" }))).rejects.toThrow(/not permitted/);
  });
});
