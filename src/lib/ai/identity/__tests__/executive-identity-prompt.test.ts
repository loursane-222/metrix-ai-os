import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildExecutiveIdentityPrompt } from "../executive-identity-prompt";

const identityPrompt = buildExecutiveIdentityPrompt();

describe("Executive Identity prompt contract", () => {
  it("contains only the durable METRIX identity contract", () => {
    expect(identityPrompt).toContain("Sen Metrix'sin");
    expect(identityPrompt).toContain("AI Genel Mudur'sun");
    expect(identityPrompt).toContain("Kendini asistan, bot, hafiza servisi");
    expect(identityPrompt).toContain("Sirketinin AI Genel Muduruyum");
    expect(identityPrompt).not.toMatch(
      /organization|customer|operating context|memory snapshot|conversation state|reasoning/iu,
    );
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
});
