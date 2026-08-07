import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ attachment: vi.fn(), members: vi.fn(), notify: vi.fn() }));
vi.mock("../customer-document-attachment.service", () => ({ resolveCustomerAttachment: mocks.attachment }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({ listActiveNotificationRecipientRecords: mocks.members }));
vi.mock("@/lib/core/notifications", () => ({ notify: mocks.notify }));

import { notifyCustomerAttachmentRecipient } from "../customer-attachment-notification.service";

describe("customer attachment targeted notification", () => {
  beforeEach(() => {
    mocks.attachment.mockReset().mockResolvedValue({ id: "attachment-1", committedCustomerId: "customer-1" });
    mocks.members.mockReset().mockResolvedValue([{ userId: "employee-1", fullName: "Ahmet Yılmaz", role: "EMPLOYEE" }]);
    mocks.notify.mockReset().mockResolvedValue({ id: "notification-1" });
  });
  it("uses canonical notify with the resolved different user and real customer source", async () => {
    await expect(notifyCustomerAttachmentRecipient({ organizationId: "org-1", actorId: "owner-1", attachmentRef: "attachment-1", target: "Ahmet'e" })).resolves.toMatchObject({ status: "DELIVERED", recipientName: "Ahmet Yılmaz" });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "employee-1", entityType: "Customer", entityId: "customer-1" }));
  });
  it("keeps employee notification copy neutral and free of sensitive customer fields", async () => {
    await notifyCustomerAttachmentRecipient({ organizationId: "org-1", actorId: "owner-1", attachmentRef: "attachment-1", target: "Ahmet'e" });
    const payload = mocks.notify.mock.calls[0]![0];
    expect(`${payload.title} ${payload.body}`).toBe("Müşteriye yeni bir belge eklendi İlgili müşteri kaydını kendi erişim yetkiniz kapsamında inceleyebilirsiniz.");
    expect(`${payload.title} ${payload.body}`).not.toMatch(/bakiye|kredi|limit|health|tier|not|dosya adı/iu);
  });
  it("does not notify before the attachment is committed to a customer", async () => {
    mocks.attachment.mockResolvedValue({ id: "attachment-1", committedCustomerId: null });
    await expect(notifyCustomerAttachmentRecipient({ organizationId: "org-1", actorId: "owner-1", attachmentRef: "attachment-1", target: "Ahmet'e" })).resolves.toEqual({ status: "NOT_COMMITTED" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
