import { describe, it, expect } from "vitest";
import { buildVoiceFastPresenceSystemPrompt } from "../voice-fast-response.service";

// Freeze Day — Production Blocker: mid-conversation reset greeting.
//
// generateVoiceFastPresenceResponse is invoked for the "new_topic" outcome
// of detectConversationContinuity — which fires on every turn that isn't a
// transformation phrase or a short elliptical fragment, including a genuine
// mid-conversation topic shift ("Bu arada yarınki müşteri toplantısını
// konuşalım."). Before this fix its system prompt never carried the
// previous AI message, so a topic shift looked identical to turn 1 of a
// brand-new conversation to the model — the proven mechanism behind it
// sometimes resetting to "Merhaba, size nasıl yardımcı olabilirim?".

const GREETING_BAN_MARKER = "nasil yardimci olabilirim";

describe("buildVoiceFastPresenceSystemPrompt — topic-shift continuity guard", () => {
  it("uses the shared Executive Identity contract", () => {
    const prompt = buildVoiceFastPresenceSystemPrompt({
      organizationSummary: "Test sirket.",
      memorySnapshotLines: [],
    });

    expect(prompt).toContain("Sen Metrix'sin");
    expect(prompt).toContain("AI Genel Mudur'sun");
    expect(prompt).toContain("Kendini asistan, bot, hafiza servisi");
  });

  it("1: true first turn (no previous AI message) — natural greeting stays free", () => {
    const prompt = buildVoiceFastPresenceSystemPrompt({
      organizationSummary: "Test sirket.",
      memorySnapshotLines: [],
    });
    expect(prompt).not.toContain(GREETING_BAN_MARKER);
    expect(prompt).not.toContain("az once soyle demistin");
  });

  it("2: topic shift with a previous AI message — continuity guard fires, previous content included", () => {
    const prompt = buildVoiceFastPresenceSystemPrompt({
      organizationSummary: "Test sirket.",
      memorySnapshotLines: [],
      previousAiMessageContent: "Tahsilat surecini bu hafta hizlandirmani oneririm.",
    });
    expect(prompt).toContain("az once soyle demistin");
    expect(prompt).toContain("Tahsilat surecini bu hafta hizlandirmani oneririm.");
    expect(prompt).toContain(GREETING_BAN_MARKER);
    expect(prompt).toContain("ayni gorusmenin devamidir, yeni bir oturum degildir");
  });

  it("empty-string previous content (explicit, not just missing) behaves like no prior turn", () => {
    const prompt = buildVoiceFastPresenceSystemPrompt({
      organizationSummary: "Test sirket.",
      memorySnapshotLines: [],
      previousAiMessageContent: "",
    });
    expect(prompt).not.toContain("az once soyle demistin");
  });
});
