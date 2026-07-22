import { describe, expect, it } from "vitest";
import { resolveTextResponseReadiness } from "../text-response-readiness";

describe("text response readiness", () => {
  it.each(["Bugün nasılsın?", "Günaydın", "  GÜNAYDIN!!!  ", "Biraz sohbet edelim.", "Bugün enerjin nasıl?"])("routes %s immediately", (message) => {
    expect(resolveTextResponseReadiness(message)).toEqual({ mode: "immediate", statusCategory: null, statusContent: null });
  });

  it.each([
    ["Şirketimin bugünkü öncelikleri ne olmalı?", "executive_analysis"],
    ["Satışlar neden düştü?", "executive_analysis"],
    ["Atlas teklifindeki durumu incele.", "customer_context"],
    ["Bu belgeyi değerlendir.", "document_review"],
  ])("routes analysis '%s' through progress", (message, category) => {
    const result = resolveTextResponseReadiness(message);
    expect(result.mode).toBe("progress");
    expect(result.statusCategory).toBe(category);
  });

  it.each(["Atlas müşterisini sil", "Ahmet’e mail gönder", "Vergi levhasından müşteri oluştur"])("blocks action %s", (message) => {
    const result = resolveTextResponseReadiness(message);
    expect(result.mode).toBe("blocking");
    expect(result.statusCategory).toBe("action_validation");
    expect(result.statusContent).not.toMatch(/tamam|sildim|gönderdim|kaydetti/iu);
  });

  it("keeps ambiguous input on the visible classification path", () => {
    expect(resolveTextResponseReadiness("Bunu ne yapalım?").mode).toBe("progress");
    expect(resolveTextResponseReadiness("Bunu ne yapalım?").statusCategory).toBe("general_processing");
  });
});
