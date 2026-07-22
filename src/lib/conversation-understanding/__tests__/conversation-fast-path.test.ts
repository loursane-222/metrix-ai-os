import { describe, expect, it } from "vitest";

import { tryFastPathClassification } from "../conversation-fast-path";

describe("conversation deterministic general-chat fast path", () => {
  it.each([
    "Bugün nasılsın?",
    "BUGÜN NASILSIN!!!",
    "Nasılsın?",
    "Nasilsin?",
    "Ne yapıyorsun?",
    "Günaydın.",
    "İyi akşamlar",
    "Teşekkür ederim!",
    "Sağ ol…",
    "Görüşürüz",
  ])("classifies harmless Turkish small talk without provider classification: %s", (message) => {
    const result = tryFastPathClassification(message);
    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.understanding).toMatchObject({
      conversationKind: "general_chat",
      userMotivation: "sohbet_etmek",
      companyRelevance: "none",
      actionExpectation: "none",
      confidence: "high",
      shouldAskClarification: false,
      shouldInvokeExecutiveBrain: false,
      suggestedHandling: "answer_only",
    });
  });

  it.each([
    "Atlas müşterisini kaydet",
    "Bugünkü tahsilatları getir",
    "Fatura oluştur",
    "Müşterileri sil",
    "Teklif hazırla",
    "Şirketin durumu nasıl?",
    "Bugün neye öncelik vermeliyiz?",
    "Satışlar neden düştü?",
    "Ahmet’e mail gönder",
    "Bu belgeyi işle",
    "Vergi levhasından müşteri aç",
  ])("does not bypass classification for business or action input: %s", (message) => {
    expect(tryFastPathClassification(message).matched).toBe(false);
  });

  it.each(["Bunu değerlendir", "Sence nasıl?", "Bugün ne olacak?"])(
    "falls back to the existing classifier for ambiguous input: %s",
    (message) => expect(tryFastPathClassification(message).matched).toBe(false),
  );
});
