import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiValidationError } from "@/lib/api/validation";

const { updateMany, findFirst } = vi.hoisted(() => ({ updateMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { calendarEvent: { updateMany, findFirst } } }));

import { updateCalendarEventDetails } from "../calendar-event.service";

describe("updateCalendarEventDetails", () => {
  beforeEach(() => { updateMany.mockReset(); findFirst.mockReset(); });

  it("patches the addressed fields for the org-scoped event and returns the fresh record", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "evt-1", title: "Yeni Başlık", participants: [], statusHistory: [] });

    const result = await updateCalendarEventDetails({ eventId: "evt-1", organizationId: "org-1", title: "Yeni Başlık" });

    expect(updateMany).toHaveBeenCalledWith({ where: { id: "evt-1", organizationId: "org-1" }, data: { title: "Yeni Başlık", description: undefined, allDay: undefined } });
    expect(result?.title).toBe("Yeni Başlık");
  });

  it("throws a 404 ApiValidationError for a non-existent/out-of-org event, matching the previous route behavior", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const rejection = updateCalendarEventDetails({ eventId: "missing", organizationId: "org-1", title: "X" });
    await expect(rejection).rejects.toBeInstanceOf(ApiValidationError);
    await expect(rejection).rejects.toMatchObject({ status: 404 });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
