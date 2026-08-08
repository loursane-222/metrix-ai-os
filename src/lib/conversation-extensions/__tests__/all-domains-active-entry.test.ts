import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

describe("conversation extensions: real active entry coverage", () => {
  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["customer", "customers", "Atlas müşterisini pasife al"],
    ["offer", "quotes", "Atlas teklifini aç"],
    ["task", "tasks", "yeni görev oluştur: haftalık raporu kontrol et"],
    ["payment", "payments", "Atlas için 100 TL tahsilat kaydet"],
    ["invoice", "invoices", "Atlas için 100 TL fatura kes"],
    ["supplier", "suppliers", "yeni tedarikçi ekle"],
  ])("routes the obvious %s command through executeActiveConversationExtension", async (domain, expectedDomain, utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { customers: [], count: 0 } }) }));

    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `active-${domain}` });

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.domain).toBe(expectedDomain);
  });
});
