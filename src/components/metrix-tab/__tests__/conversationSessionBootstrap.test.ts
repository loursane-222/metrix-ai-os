import { describe, expect, it } from "vitest";

import { decideConversationSessionBootstrap } from "../conversationSessionBootstrap";
import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";

const greeting = { role: "metrix" as const, content: "Yeni çalışma oturumu hazır." };
const dailyBriefing = {
  headline: "Bugünün kritik işi",
  topPriorities: [{ title: "Atlas tahsilatını takip et" }],
} as unknown as ExecutiveDailyBriefingV2;

describe("conversation session bootstrap", () => {
  it("starts clean and clears old restore state for a new authentication session", () => {
    expect(decideConversationSessionBootstrap({
      previousAuthSessionId: "auth_old",
      authSessionId: "auth_new",
      storedConversationId: "conversation_old",
      firstExperienceActive: true,
      firstExperienceConversationId: "first_old",
      firstExperienceMessages: [{ role: "user", content: "eski mesaj" }],
      dailyBrief: null,
      greeting,
    })).toEqual({
      clearStoredConversation: true,
      restoreConversationId: null,
      initialMessages: [greeting],
    });
  });

  it("restores the active conversation within the same authentication session", () => {
    expect(decideConversationSessionBootstrap({
      previousAuthSessionId: "auth_1",
      authSessionId: "auth_1",
      storedConversationId: "conversation_active",
      firstExperienceActive: false,
      firstExperienceConversationId: null,
      firstExperienceMessages: [],
      dailyBrief: null,
      greeting,
    }).restoreConversationId).toBe("conversation_active");
  });

  it("shows today's brief as opening content without restoring a normal conversation", () => {
    const decision = decideConversationSessionBootstrap({
      previousAuthSessionId: null,
      authSessionId: "auth_1",
      storedConversationId: "conversation_old",
      firstExperienceActive: false,
      firstExperienceConversationId: null,
      firstExperienceMessages: [],
      dailyBrief: { content: "Bugünün kritik işi", briefing: dailyBriefing },
      greeting,
    });
    expect(decision.restoreConversationId).toBeNull();
    expect(decision.initialMessages).toEqual([
      { role: "metrix", content: "Bugünün kritik işi", dailyBriefing },
    ]);
  });

  it("allows an active first experience only inside the same authentication session", () => {
    const messages = [{ role: "metrix" as const, content: "İlk görüşme" }];
    expect(decideConversationSessionBootstrap({
      previousAuthSessionId: "auth_1",
      authSessionId: "auth_1",
      storedConversationId: null,
      firstExperienceActive: true,
      firstExperienceConversationId: "first_1",
      firstExperienceMessages: messages,
      dailyBrief: null,
      greeting,
    })).toMatchObject({ restoreConversationId: "first_1", initialMessages: messages });
  });
});
