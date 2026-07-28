import { describe, expect, it } from "vitest";
import { COMPANY_INTENT_EXAMPLES, resolveCompanyIntentAuthority } from "../company-intent-authority";

describe("Company text/voice intent authority", () => {
  it("maps all eight required intents through the same reasoning and response authorities", () => {
    expect(COMPANY_INTENT_EXAMPLES).toHaveLength(8);
    for (const example of COMPANY_INTENT_EXAMPLES) {
      const text = resolveCompanyIntentAuthority(example.utterance, "TEXT");
      const voice = resolveCompanyIntentAuthority(example.utterance, "VOICE");
      expect(text).toMatchObject({ targetDomain: example.targetDomain, authority: example.authority, reasoningAuthority: "UNIVERSAL_CAPTURE", responseAuthority: "CANONICAL_RESPONSE_PRODUCER" });
      expect(voice).toMatchObject({ targetDomain: example.targetDomain, authority: example.authority, reasoningAuthority: text?.reasoningAuthority, responseAuthority: text?.responseAuthority });
    }
  });
  it("keeps mutations behind Candidate and reads on canonical projections", () => {
    expect(COMPANY_INTENT_EXAMPLES.filter((x) => x.kind === "MUTATION").every((x) => x.authority === "BUSINESS_CANDIDATE")).toBe(true);
    expect(COMPANY_INTENT_EXAMPLES.filter((x) => x.kind === "READ").every((x) => x.authority === "CANONICAL_PROJECTION")).toBe(true);
  });
});
