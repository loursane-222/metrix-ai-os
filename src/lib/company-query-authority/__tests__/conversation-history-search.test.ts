import { describe, expect, it, vi } from "vitest";
import { searchConversationHistory } from "../conversation-history-search.service";

const now = new Date("2026-09-02T09:00:00.000Z");

describe("conversation history search — bounded keyword retrieval, not a full history load", () => {
  it("scopes the query to organizationId and excludes the current conversation", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await searchConversationHistory("org-1", { excludeConversationId: "conv-current", keywords: ["Atlas"] }, { message: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversation: { organizationId: "org-1", id: { not: "conv-current" } } }),
    }));
  });

  it("returns no results (never the whole table) when every keyword is blank/too short", async () => {
    const findMany = vi.fn();
    const hits = await searchConversationHistory("org-1", { excludeConversationId: "conv-current", keywords: ["", " ", "a"] }, { message: { findMany } });
    expect(hits).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("deduplicates to one hit per conversation, keeping the most recent match", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "m2", conversationId: "conv-1", content: "Atlas ile ikinci mesaj, ödeme planı hakkında.", createdAt: now, conversation: { title: "Atlas görüşmesi" } },
      { id: "m1", conversationId: "conv-1", content: "Atlas ile ilk mesaj.", createdAt: new Date(now.getTime() - 86_400_000), conversation: { title: "Atlas görüşmesi" } },
      { id: "m3", conversationId: "conv-2", content: "Başka bir konuşmada Atlas geçti.", createdAt: now, conversation: { title: null } },
    ]);
    const hits = await searchConversationHistory("org-1", { excludeConversationId: "conv-current", keywords: ["Atlas"] }, { message: { findMany } });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ conversationId: "conv-1", snippet: expect.stringContaining("ikinci mesaj") });
    expect(hits[1]).toMatchObject({ conversationId: "conv-2" });
  });

  it("caps results at the documented limit even with many matching conversations", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`, conversationId: `conv-${i}`, content: "Atlas hakkında bir not.", createdAt: now, conversation: { title: null },
    }));
    const findMany = vi.fn().mockResolvedValue(rows);
    const hits = await searchConversationHistory("org-1", { excludeConversationId: "conv-current", keywords: ["Atlas"] }, { message: { findMany } });
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it("builds an OR filter across all supplied keywords (customer name plus topic words)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await searchConversationHistory("org-1", { excludeConversationId: "conv-current", keywords: ["Atlas İnşaat", "ödeme planı"] }, { message: { findMany } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { content: { contains: "Atlas İnşaat", mode: "insensitive" } },
          { content: { contains: "ödeme planı", mode: "insensitive" } },
        ],
      }),
    }));
  });
});
