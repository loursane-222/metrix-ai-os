import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
  findActor: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({ listActiveNotificationRecipientRecords: mocks.listMembers }));
vi.mock("@/lib/core/users/user.repository", () => ({ findUserRecordById: mocks.findActor }));
vi.mock("../notification.service", () => ({ notify: mocks.notify }));

import { notifyWithOwnerFanout } from "../notification-fanout.service";

describe("notifyWithOwnerFanout additional targets", () => {
  beforeEach(() => {
    mocks.listMembers.mockReset();
    mocks.findActor.mockReset().mockResolvedValue({ fullName: "Mert Kurucu" });
    mocks.notify.mockReset().mockImplementation(async (input) => ({ id: `notification-${input.recipientUserId}`, ...input }));
  });

  it("adds a resolved free-text target to OWNER and EXECUTIVE without duplicates", async () => {
    mocks.listMembers.mockResolvedValue([
      { userId: "owner-1", fullName: "Oya Sahip", role: "OWNER" },
      { userId: "executive-1", fullName: "Ece Yönetici", role: "EXECUTIVE" },
      { userId: "ahmet-1", fullName: "Ahmet Yılmaz", role: "MANAGER" },
    ]);

    const result = await notifyWithOwnerFanout({ organizationId: "org-1", actorUserId: "actor-1", type: "customer.created", title: "Yeni müşteri", additionalTargets: ["Ahmet'e", "Ahmet'e"] });

    expect(mocks.notify.mock.calls.map(([input]) => input.recipientUserId)).toEqual(["owner-1", "executive-1", "ahmet-1"]);
    expect(result.additionalTargetResolutions).toHaveLength(2);
    expect(result.additionalTargetResolutions.every((item) => item.resolution.status === "RESOLVED")).toBe(true);
  });

  it("reports an ambiguous role and does not select a random manager", async () => {
    mocks.listMembers.mockResolvedValue([
      { userId: "owner-1", fullName: "Oya Sahip", role: "OWNER" },
      { userId: "manager-1", fullName: "Ahmet Yılmaz", role: "MANAGER" },
      { userId: "manager-2", fullName: "Ayşe Demir", role: "MANAGER" },
    ]);

    const result = await notifyWithOwnerFanout({ organizationId: "org-1", type: "customer.created", title: "Yeni müşteri", additionalTargets: ["yöneticiye"] });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "owner-1" }));
    expect(result.additionalTargetResolutions[0]?.resolution).toMatchObject({ status: "AMBIGUOUS", candidates: [{ userId: "manager-1" }, { userId: "manager-2" }] });
  });
});
