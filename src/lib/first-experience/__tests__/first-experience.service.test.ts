import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOpeningConversation: vi.fn(),
  getLatestDailyBriefingForOrganization: vi.fn(),
}));

vi.mock("../first-experience.repository", () => ({
  claimFirstExperienceOpening: vi.fn(),
  completeFirstExperienceCompatibility: vi.fn(),
  findOpeningConversation: mocks.findOpeningConversation,
}));
vi.mock("@/lib/daily-briefing/daily-briefing-storage.service", () => ({
  getLatestDailyBriefingForOrganization: mocks.getLatestDailyBriefingForOrganization,
}));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { $transaction: vi.fn() } }));

import { bootstrapFirstExperience } from "../first-experience.service";

function auth(status: "COMPLETED" | "IN_PROGRESS") {
  return {
    session: { id: "auth_1" },
    organization: { id: "org_1", onboardingStatus: status, onboardingStep: null },
    membership: { role: "OWNER" },
    user: { id: "user_1", fullName: "Ada" },
  } as never;
}

describe("first experience bootstrap conversation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLatestDailyBriefingForOrganization.mockResolvedValue(null);
  });

  it("does not return a completed first-experience conversation as login history", async () => {
    const result = await bootstrapFirstExperience(auth("COMPLETED"));
    expect(mocks.findOpeningConversation).not.toHaveBeenCalled();
    expect(result.conversationId).toBeNull();
    expect(result.messages).toEqual([]);
    expect(result.active).toBe(false);
  });

  it("may resume first experience while onboarding is still active", async () => {
    mocks.findOpeningConversation.mockResolvedValue({
      id: "first_1",
      messages: [{ senderType: "AI", content: "İlk görüşme" }],
    });
    const result = await bootstrapFirstExperience(auth("IN_PROGRESS"));
    expect(mocks.findOpeningConversation).toHaveBeenCalledWith("org_1", "user_1");
    expect(result.conversationId).toBe("first_1");
    expect(result.active).toBe(true);
  });

  it("opens only today's canonical company briefing and never promotes a market-only summary", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const base = {
      conversationId: "brief_1", briefingDate: today, briefingPackage: {}, summary: { executiveSummary: "Genel ekonomi özeti" },
      executiveDailyBriefingV2: { headline: "Tahsilat önceliği", topPriorities: [], criticalAlerts: [], decisionFollowUps: { openDecisions: [], overdueCommittedDecision: null, latestOutcome: null } },
    };
    mocks.getLatestDailyBriefingForOrganization.mockResolvedValue(base);
    await expect(bootstrapFirstExperience(auth("COMPLETED"))).resolves.toMatchObject({ dailyBrief: null });

    mocks.getLatestDailyBriefingForOrganization.mockResolvedValue({ ...base, executiveDailyBriefingV2: { ...base.executiveDailyBriefingV2, topPriorities: [{ headline: "Tahsilat" }] } });
    await expect(bootstrapFirstExperience(auth("COMPLETED"))).resolves.toMatchObject({ dailyBrief: { conversationId: "brief_1", content: "Tahsilat önceliği" } });
  });
});
