import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiValidationError } from "@/lib/api/validation";

const findFirst = vi.fn();
const update = vi.fn();
const findUniqueOrThrow = vi.fn();
const statusHistoryCreate = vi.fn();
const tx = { calendarEvent: { findFirst, update, findUniqueOrThrow }, calendarEventStatusHistory: { create: statusHistoryCreate } };
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } }));

import { rescheduleCalendarEvent, transitionCalendarEventStatus } from "../calendar-event.service";

describe("calendar-event.service — not-found status code", () => {
  beforeEach(() => { findFirst.mockReset(); update.mockReset(); findUniqueOrThrow.mockReset(); statusHistoryCreate.mockReset(); });

  it("transitionCalendarEventStatus throws a 404 ApiValidationError for a non-existent/out-of-org event", async () => {
    findFirst.mockResolvedValue(null);
    await expect(transitionCalendarEventStatus({ eventId: "missing", organizationId: "org-1", toStatus: "CONFIRMED" }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("rescheduleCalendarEvent throws a 404 ApiValidationError for a non-existent/out-of-org event", async () => {
    findFirst.mockResolvedValue(null);
    await expect(rescheduleCalendarEvent({ eventId: "missing", organizationId: "org-1", startAt: new Date("2026-08-25T10:00:00Z"), endAt: new Date("2026-08-25T11:00:00Z") }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("an invalid status transition still fails as a 400, not a 404", async () => {
    findFirst.mockResolvedValue({ id: "event-1", status: "CANCELLED" });
    const rejection = transitionCalendarEventStatus({ eventId: "event-1", organizationId: "org-1", toStatus: "CONFIRMED" });
    await expect(rejection).rejects.toBeInstanceOf(ApiValidationError);
    await expect(rejection).rejects.toMatchObject({ status: 400 });
  });
});
