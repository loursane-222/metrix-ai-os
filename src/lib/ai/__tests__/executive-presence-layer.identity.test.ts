import { describe, expect, it } from "vitest";

import { sanitizeExecutiveManagerResponse } from "../executive-presence-layer";

describe("sanitizeExecutiveManagerResponse identity boundary", () => {
  it.each([
    ["Ben ChatGPT'yim.", "self_identified_as_general_ai"],
    ["Kalıcı hafızam yok ve şirketini tanımıyorum.", "absolute_context_denial"],
    ["Hiçbir sistemde işlem yapamam.", "absolute_capability_denial"],
    ["Her sistemde sınırsızca işlem yapabilirim.", "unbounded_capability_claim"],
  ])("routes %s into the existing repair contract", (content, reason) => {
    expect(
      sanitizeExecutiveManagerResponse({ content, userMessage: "Sen kimsin?" }),
    ).toEqual({ content, needsRepair: true, reason });
  });

  it("preserves third-person explanations", () => {
    expect(
      sanitizeExecutiveManagerResponse({
        content: "ChatGPT genel amaçlı bir modeldir.",
        userMessage: "ChatGPT nedir?",
      }),
    ).toEqual({
      content: "ChatGPT genel amaçlı bir modeldir.",
      needsRepair: false,
    });
  });

  it("keeps a normal production response on the no-repair path", () => {
    const content = "Tahsilat sistemindeki mevcut context bu kararı destekliyor; önce vade kaydını doğrulayalım.";
    expect(
      sanitizeExecutiveManagerResponse({
        content,
        userMessage: "Bu müşteriye yeniden vade verelim mi?",
      }),
    ).toEqual({ content, needsRepair: false });
  });

  it("routes a generic assistant register to repair", () => {
    expect(
      sanitizeExecutiveManagerResponse({
        content: "Size nasıl yardımcı olabilirim?",
        userMessage: "Merhaba",
      }),
    ).toEqual({
      content: "Size nasıl yardımcı olabilirim?",
      needsRepair: true,
      reason: "generic_assistant_register",
    });
  });
});
