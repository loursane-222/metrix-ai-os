import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildExecutiveIdentityPrompt,
  buildExecutiveFallbackResponse,
  buildExecutivePresenceSurfacePolicy,
  getExecutivePresencePolicy,
  validateExecutivePresenceResponse,
} from "../executive-identity-prompt";

const identityPrompt = buildExecutiveIdentityPrompt();

describe("Executive Identity prompt contract", () => {
  it("contains the canonical durable identity and product truth contract", () => {
    expect(getExecutivePresencePolicy().authorityId).toBe(
      "executive-presence-runtime-authority",
    );
    expect(identityPrompt).toContain("Sen Metrix'sin");
    expect(identityPrompt).toContain("AI Genel Müdürüsün");
    expect(identityPrompt).toContain("Kendini asistan, bot, hafıza servisi");
    expect(identityPrompt).toContain("ChatGPT");
    expect(identityPrompt).toContain("general-purpose AI");
    expect(identityPrompt).toContain("Şirketinin AI Genel Müdürüyüm");
    expect(identityPrompt).toContain("Fact, observation, inference, opinion ve unknown");
    expect(identityPrompt).toContain("request resolution ve action runtime");
    expect(identityPrompt).toContain("permission'ı, organization context");
    expect(identityPrompt).toContain("Canonical Knowledge veya hafıza üretme");
    expect(identityPrompt).toContain("İş dışı doğal sohbeti iş performansına zorla çevirme");
    expect(identityPrompt).toContain("kullanıcı ve konuşma bağlamını");
    expect(identityPrompt).toContain("kararlı, dürüst, doğrudan ve doğal konuş");
    expect(identityPrompt).toContain("25 yılı aşan yönetim tecrübesi");
    expect(identityPrompt).toContain("60 yaş üstü");
    expect(identityPrompt).toContain("babacan/anaç");
    expect(identityPrompt).toContain("dışarıdan rapor veren danışman");
    expect(identityPrompt).toContain("burada kabul etmeyelim");
    expect(identityPrompt).toContain("Soyut ve genel yönetim öğütleri sıralama");
    expect(identityPrompt).toContain("CALM ise istikrar ver");
    expect(identityPrompt).toContain("FIRM ise kanıta dayalı sınır");
    expect(identityPrompt).toContain("İlk cümle gerçek cevabın");
    expect(identityPrompt).toContain("Tabii, hemen yardımcı olayım");
    expect(identityPrompt).toContain("Elbette, buna birlikte bakalım");
    expect(identityPrompt).toContain("Başka nasıl yardımcı olabilirim?");
    expect(identityPrompt).toContain("Başka isteğin var mı?");
    expect(identityPrompt).toContain("jenerik yardım teklifiyle kapatma");
  });

  it("tells every surface (including voice) to answer as a human first and only explain identity if asked directly", () => {
    // Regression guard for the 2026-08-26 live bug: voice answered "selam
    // metrix bugün nasılsın?" with a cold identity statement instead of a
    // warm, in-character reply, because this instruction previously lived
    // only in prompt-format.ts (the text-chat prompt), not here — so it
    // never reached buildExecutiveIdentityPrompt()'s voice/realtime callers.
    expect(identityPrompt).toContain("Once kullanicinin mesajini anla");
    expect(identityPrompt).toContain("Kimligini yalnizca kullanici dogrudan sorarsa acikla");
    expect(identityPrompt).toContain("bir selamlama veya hal hatir sorusu");
  });

  it("treats explicit self-reference/identity requests as an identity question, not well-being small talk", () => {
    // Regression guard for the 2026-09-01 production bug: "Selam Metrix,
    // bana kendinden bahseder misin?" got answered as if it were "nasılsın?"
    // ("Selam, iyiyim, teşekkür ederim. Sen nasılsın?"). The prior instruction
    // only carved OUT well-being ('nasilsin', 'naber') from identity — it
    // never named what a genuine self-reference request looks like, so the
    // model had no positive signal to anchor "kendinden bahset" to identity
    // instead of small talk.
    expect(identityPrompt).toContain("kendinden bahset");
    expect(identityPrompt).toContain("sen kimsin");
    expect(identityPrompt).toContain("dogrudan bir kimlik sorusudur, hal hatir degildir");
  });

  it("prefers identity intent over a greeting prefix when both are present in one message", () => {
    // "Selam Metrix, bana kendinden bahseder misin?" and "Metrix sen nesin?"
    // both carry a greeting/address alongside the real question; the greeting
    // must never suppress the substantive identity intent.
    expect(identityPrompt).toContain("sen nesin");
    expect(identityPrompt).toContain("somut kimlik niyetini esas al");
    expect(identityPrompt).toContain("onu yalnizca selamlama/hal hatir gibi cevaplama");
  });

  it("keeps genuine well-being questions ('nasılsın', 'naber') answered as small talk, not identity", () => {
    // Must stay true after the self-reference addition above — this is the
    // original 2026-08-26 guard this fix must not regress.
    expect(identityPrompt).toContain("Kimligini yalnizca kullanici dogrudan sorarsa acikla");
    expect(identityPrompt).toContain("bir selamlama veya hal hatir sorusu");
    expect(identityPrompt).toContain("'nasilsin', 'naber'");
  });

  it("keeps capability questions ('ne yapabilirsin?') on their own explicit-ask rule, unaffected by the identity fix", () => {
    expect(identityPrompt).toContain("ne yapabilirsin?");
    expect(identityPrompt).toContain("Kullanici acikca sormadikca konuyu kendiliginden bir yetenek listesine getirme");
  });

  it("is the shared identity source for canonical chat and the transcription session", () => {
    const sources = [
      readFileSync(new URL("../../prompts/prompt-format.ts", import.meta.url), "utf8"),
      readFileSync(
        new URL("../../../../app/api/ai/chat/voice/session/route.ts", import.meta.url),
        "utf8",
      ),
    ];

    for (const source of sources) {
      expect(source).toContain("buildExecutiveIdentityPrompt");
    }
  });

  it("keeps voice delivery separate from the canonical identity", () => {
    const voicePolicy = buildExecutivePresenceSurfacePolicy({ surface: "voice" });
    const chatPolicy = buildExecutivePresenceSurfacePolicy({ surface: "chat" });

    expect(voicePolicy).toContain("Markdown");
    expect(voicePolicy).toContain("kısa cümleler");
    expect(voicePolicy).not.toContain("AI Genel Müdür");
    expect(chatPolicy).toBe("");
  });

  it.each([
    ["Ben ChatGPT'yim.", "self_identified_as_general_ai"],
    ["Ben genel amaçlı bir yapay zekâ modeliyim.", "self_identified_as_general_ai"],
    ["Kalıcı hafızam yok ve şirketini tanımıyorum.", "absolute_context_denial"],
    ["Hiçbir sistemde işlem yapamam.", "absolute_capability_denial"],
    ["Her sistemde sınırsızca işlem yapabilirim.", "unbounded_capability_claim"],
    ["Benim kanaatim kesin bir gerçektir.", "epistemic_overclaim"],
  ])("detects identity violation: %s", (content, violation) => {
    expect(validateExecutivePresenceResponse(content)).toEqual({
      valid: false,
      violation,
    });
  });

  it("does not treat a third-person ChatGPT explanation as METRIX self-identification", () => {
    expect(
      validateExecutivePresenceResponse("ChatGPT genel amaçlı bir modeldir."),
    ).toEqual({ valid: true, violation: null });
  });

  it.each([
    "empty_response",
    "provider_timeout",
    "provider_failure",
    "unsupported_capability",
    "forbidden",
    "data_unavailable",
    "repair_failed",
  ] as const)("keeps canonical identity truth in the %s fallback", (reason) => {
    const content = buildExecutiveFallbackResponse(reason);
    expect(validateExecutivePresenceResponse(content)).toEqual({ valid: true, violation: null });
    expect(content).not.toMatch(/ChatGPT|dil modeli|kalıcı hafızam yok|işlem yapamam/iu);
  });

  it("distinguishes permission, unavailable data, unsupported capability and technical failure", () => {
    expect(buildExecutiveFallbackResponse("forbidden")).toContain("yetki");
    expect(buildExecutiveFallbackResponse("data_unavailable")).toContain("bilgi henüz bulunmuyor");
    expect(buildExecutiveFallbackResponse("unsupported_capability")).toContain("henüz bağlı değil");
    expect(buildExecutiveFallbackResponse("provider_timeout")).toContain("zamanında tamamlayamadım");
  });
});
