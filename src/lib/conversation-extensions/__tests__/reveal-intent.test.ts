import { describe, expect, it } from "vitest";
import { hasExplicitRevealIntent, isBareRevealFollowUp } from "../reveal-intent";

describe("hasExplicitRevealIntent — Workspace-intent contract shared signal", () => {
  it.each([
    "Yeni müşteri oluştur ve göster.",
    "Kaydet, kartını aç.",
    "Atlas'ı kaydet ve detayına bak.",
    "Oluştur, kontrol edelim.",
    "Ekranda göster.",
  ])("recognizes an unambiguous reveal phrase: %s", (utterance) => {
    expect(hasExplicitRevealIntent(utterance)).toBe(true);
  });

  it.each([
    "Yeni müşteri oluştur.",
    "Kaydet.",
    "Atlas'ın telefonunu güncelle.",
    "Müşteri aç: Test Firma.",
    "Yeni müşteri aç.",
  ])("does not fire for ordinary create/update phrasing, including bare 'aç' (a CREATE synonym in this domain's own vocabulary): %s", (utterance) => {
    expect(hasExplicitRevealIntent(utterance)).toBe(false);
  });
});

describe("isBareRevealFollowUp — deterministic, zero-round-trip follow-up recognition", () => {
  it.each(["Aç.", "aç", "Göster!", "goster", "Kontrol edelim.", "Detayına bakalım.", "Açalım."])(
    "recognizes a bare follow-up: %s",
    (utterance) => {
      expect(isBareRevealFollowUp(utterance)).toBe(true);
    },
  );

  it.each([
    "Atlas'ı aç.",
    "Aç ve güncelle.",
    "Yeni müşteri aç.",
    "",
    "Bugün hava nasıl?",
  ])("does not match a longer or unrelated message: %s", (utterance) => {
    expect(isBareRevealFollowUp(utterance)).toBe(false);
  });
});
