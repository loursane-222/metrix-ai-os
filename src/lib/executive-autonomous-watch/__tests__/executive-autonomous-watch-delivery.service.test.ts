// Notification preference gating (Grand Consolidation §8, acceptance H/I).
// "Hiç konuşmasın" and per-category mutes must block delivery without
// blocking background awareness evaluation (that guarantee lives in the
// orchestrator, which always calls applyJudgment regardless of preference —
// this module is only ever consulted for delivery).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyMock, listActiveNotificationRecipientRecordsMock, organizationMemberFindManyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  organizationMemberFindManyMock: vi.fn(),
}));

vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { organizationMember: { findMany: organizationMemberFindManyMock } },
}));

import { deliverJudgment } from "../executive-autonomous-watch-delivery.service";

const owner = { userId: "user-owner", fullName: "Ayşe Owner", role: "OWNER" as const };
const member = { userId: "user-member", fullName: "Ali Member", role: "MEMBER" as const };

const judgment = {
  correlationTitle: "Nakit baskısı",
  evidenceFingerprints: ["a"],
  disposition: "INTERVENE" as const,
  significance: "CRITICAL" as const,
  confidence: 0.9,
  reason: "r",
  insight: "Üç büyük alacak aynı haftada gecikti.",
  recommendedNextMove: null,
  urgency: "IMMEDIATE" as const,
  category: "FINANS" as const,
  deliveryEligible: true,
};

describe("deliverJudgment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("notifies only OWNER/EXECUTIVE recipients, never a plain MEMBER", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner, member]);
    organizationMemberFindManyMock.mockResolvedValue([{ userId: "user-owner", awarenessMuteAll: false, awarenessMutedCategories: null }]);

    const delivered = await deliverJudgment("org-1", "insight-1", judgment);

    expect(delivered).toBe(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "user-owner", entityId: "insight-1" }));
  });

  it("respects 'Hiç konuşmasın' (mute-all) — no delivery for that recipient", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner]);
    organizationMemberFindManyMock.mockResolvedValue([{ userId: "user-owner", awarenessMuteAll: true, awarenessMutedCategories: null }]);

    const delivered = await deliverJudgment("org-1", "insight-1", judgment);

    expect(delivered).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("respects a per-category mute", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner]);
    organizationMemberFindManyMock.mockResolvedValue([{ userId: "user-owner", awarenessMuteAll: false, awarenessMutedCategories: ["FINANS"] }]);

    const delivered = await deliverJudgment("org-1", "insight-1", judgment);

    expect(delivered).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("still delivers a category not in the muted list", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([owner]);
    organizationMemberFindManyMock.mockResolvedValue([{ userId: "user-owner", awarenessMuteAll: false, awarenessMutedCategories: ["SATIS"] }]);

    const delivered = await deliverJudgment("org-1", "insight-1", judgment);

    expect(delivered).toBe(1);
  });

  it("reports zero without calling notify when there are no OWNER/EXECUTIVE recipients", async () => {
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([member]);

    const delivered = await deliverJudgment("org-1", "insight-1", judgment);

    expect(delivered).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(organizationMemberFindManyMock).not.toHaveBeenCalled();
  });
});
