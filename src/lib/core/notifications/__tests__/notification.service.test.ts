import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createNotificationMock, listNotificationsForOrganizationMock, countUnreadNotificationsMock, getNotificationByIdMock, markNotificationReadMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(),
  listNotificationsForOrganizationMock: vi.fn(),
  countUnreadNotificationsMock: vi.fn(),
  getNotificationByIdMock: vi.fn(),
  markNotificationReadMock: vi.fn(),
}));

vi.mock("../notification.repository", () => ({
  createNotification: createNotificationMock,
  listNotificationsForOrganization: listNotificationsForOrganizationMock,
  countUnreadNotifications: countUnreadNotificationsMock,
  getNotificationById: getNotificationByIdMock,
  markNotificationRead: markNotificationReadMock,
}));

import { getUnreadNotificationCount, listNotifications, markNotificationAsRead, notify } from "../notification.service";

describe("notify", () => {
  beforeEach(() => {
    createNotificationMock.mockReset();
    listNotificationsForOrganizationMock.mockReset();
    countUnreadNotificationsMock.mockReset();
    getNotificationByIdMock.mockReset();
    markNotificationReadMock.mockReset();
  });

  it("rejects a notification missing a title", async () => {
    await expect(
      notify({ organizationId: "org-1", type: "quote.opened", title: "" }),
    ).rejects.toThrow(ApiValidationError);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("creates a notification when required fields are present", async () => {
    createNotificationMock.mockResolvedValue({ id: "n-1", title: "Teklif açıldı" });

    const result = await notify({ organizationId: "org-1", type: "quote.opened", title: "Teklif açıldı" });

    expect(result.id).toBe("n-1");
    expect(createNotificationMock).toHaveBeenCalledWith({ organizationId: "org-1", type: "quote.opened", title: "Teklif açıldı" });
  });

  it("lists notifications for an organization", async () => {
    listNotificationsForOrganizationMock.mockResolvedValue([{ id: "n-1" }]);

    const result = await listNotifications({ organizationId: "org-1" });

    expect(result).toHaveLength(1);
    expect(listNotificationsForOrganizationMock).toHaveBeenCalledWith({ organizationId: "org-1" });
  });

  it("counts unread notifications", async () => {
    countUnreadNotificationsMock.mockResolvedValue(3);

    await expect(getUnreadNotificationCount("org-1", "user-1")).resolves.toBe(3);
    expect(countUnreadNotificationsMock).toHaveBeenCalledWith("org-1", "user-1");
  });

  describe("markNotificationAsRead", () => {
    it("throws when the notification does not exist for the organization", async () => {
      getNotificationByIdMock.mockResolvedValue(null);

      await expect(markNotificationAsRead("org-1", "missing")).rejects.toThrow(ApiValidationError);
      expect(markNotificationReadMock).not.toHaveBeenCalled();
    });

    it("is idempotent when the notification is already read", async () => {
      getNotificationByIdMock.mockResolvedValue({ id: "n-1", isRead: true });

      const result = await markNotificationAsRead("org-1", "n-1");

      expect(result.isRead).toBe(true);
      expect(markNotificationReadMock).not.toHaveBeenCalled();
    });

    it("marks an unread notification as read", async () => {
      getNotificationByIdMock.mockResolvedValue({ id: "n-1", isRead: false });
      markNotificationReadMock.mockResolvedValue({ id: "n-1", isRead: true });

      const result = await markNotificationAsRead("org-1", "n-1");

      expect(result.isRead).toBe(true);
      expect(markNotificationReadMock).toHaveBeenCalledWith("org-1", "n-1", expect.any(Date));
    });
  });
});
