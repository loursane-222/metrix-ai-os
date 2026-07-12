import { describe, expect, it } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";

describe("Gmail source context", () => {
  const memoryContext = { version: "v1" as const, generatedAt: "2026-07-12T10:00:00Z", organizationId: "org-1", totalIncluded: 0, highlights: [], strategic: [], facts: [], processes: [], preferences: [], conflicts: [] };

  it("preserves provider and Gmail source identity in executive context", () => {
    const prompt = buildBaseMetrixPrompt({
      memoryContext,
      gmailContext: { requested: true, status: "OK", retrievedAt: "2026-07-12T10:00:00Z", messages: [{ provider: "gmail", messageId: "msg-1", threadId: "thread-1", gmailUrl: "https://mail.google.com/mail/u/0/#all/thread-1", sender: "Ahmet", recipients: "owner", subject: "Tahsilat", receivedAt: "2026-07-12T09:00:00Z", snippet: "Ödeme", body: "Ödeme cuma yapılacak." }] },
    });
    expect(prompt).toContain("provider=gmail; messageId=msg-1; threadId=thread-1");
    expect(prompt).toContain("yalnizca okundu");
  });

  it("does not add Gmail context when retrieval was not requested", () => {
    const prompt = buildBaseMetrixPrompt({ memoryContext, gmailContext: { requested: false, status: "OK", retrievedAt: "now", messages: [] } });
    expect(prompt).not.toContain("GMAIL READ-ONLY");
  });
});
