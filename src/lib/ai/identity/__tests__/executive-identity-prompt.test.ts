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
  });

  it("is the shared identity source for normal chat, Voice Fast, and Native Session", () => {
    const sources = [
      readFileSync(new URL("../../prompts/prompt-format.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../voice-fast-response.service.ts", import.meta.url), "utf8"),
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
