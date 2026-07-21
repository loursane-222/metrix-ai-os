import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createMessage: vi.fn(),
  findBriefingConversationByDate: vi.fn(),
  findLastAiMessageByConversation: vi.fn(),
  findLatestBriefingConversation: vi.fn(),
}));

vi.mock("@/lib/core/conversations/conversation.repository", () => repository);

import { storeDailyBriefing } from "../daily-briefing-storage.service";

describe("storeDailyBriefing duplicate protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findBriefingConversationByDate.mockResolvedValue({ id: "existing-conversation" });
    repository.findLastAiMessageByConversation.mockResolvedValue({ id: "existing-message" });
  });

  it("does not create a second conversation for the same organization and day", async () => {
    const result = await storeDailyBriefing({
      organizationId: "org-1",
      briefingPackage: { briefingDate: "2026-07-21" } as never,
      summary: { executiveSummary: "Özet" } as never,
    });

    expect(result).toEqual({
      conversationId: "existing-conversation",
      messageId: "existing-message",
      wasAlreadyStored: true,
    });
    expect(repository.findBriefingConversationByDate).toHaveBeenCalledWith("org-1", "2026-07-21");
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(repository.createMessage).not.toHaveBeenCalled();
  });
});
