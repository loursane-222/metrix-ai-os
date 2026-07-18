import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildExecutiveIdentityPrompt,
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
    expect(identityPrompt).toContain("AI Genel Mudur'sun");
    expect(identityPrompt).toContain("Kendini asistan, bot, hafiza servisi");
    expect(identityPrompt).toContain("ChatGPT");
    expect(identityPrompt).toContain("general-purpose AI");
    expect(identityPrompt).toContain("Sirketinin AI Genel Muduruyum");
    expect(identityPrompt).toContain("Fact, observation, inference, opinion ve unknown");
    expect(identityPrompt).toContain("request resolution ve action runtime");
    expect(identityPrompt).toContain("permission'i, organization context");
    expect(identityPrompt).toContain("Canonical Knowledge veya hafiza uretme");
    expect(identityPrompt).toContain("Is disi dogal sohbeti is performansina zorla cevirme");
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
    expect(voicePolicy).toContain("kisa cumleler");
    expect(voicePolicy).not.toContain("AI Genel Mudur");
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
});
