import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { classifyConversation } from "../conversation-understanding.service";

const originalApiKey = process.env.OPENAI_API_KEY;

function providerUnderstanding(overrides: Record<string, unknown> = {}) {
  return {
    conversationKind: "general_chat",
    userMotivation: "bilgi_almak",
    companyRelevance: "none",
    actionExpectation: "none",
    confidence: "high",
    shouldAskClarification: false,
    clarificationQuestion: null,
    shouldInvokeExecutiveBrain: false,
    suggestedHandling: "answer_only",
    businessNavigation: null,
    externalEvidenceNeed: { capability: "CURRENT_NEWS", query: "bugün teknoloji sektöründe önemli gelişmeler" },
    reasoning: { summary: "s", observations: [], uncertainty: [], whyThisHandling: "w" },
    ...overrides,
  };
}

describe("conversation understanding — external evidence recognition (Phase B)", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("preserves a valid externalEvidenceNeed from the canonical provider", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding()) });
    await expect(classifyConversation({ message: "Bugün teknoloji dünyasında önemli ne oldu?" })).resolves.toMatchObject({
      externalEvidenceNeed: { capability: "CURRENT_NEWS", query: "bugün teknoloji sektöründe önemli gelişmeler" },
    });
  });

  it("accepts a null externalEvidenceNeed for internal/company-truth turns", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        conversationKind: "company_related",
        companyRelevance: "high",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
        businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
        externalEvidenceNeed: null,
      })),
    });
    await expect(classifyConversation({ message: "Geçen ay tahsilatımız ne kadar?" })).resolves.toMatchObject({
      businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
      externalEvidenceNeed: null,
    });
  });

  it.each(["WEB_SEARCH", "CURRENT_NEWS", "COMPANY_RESEARCH"] as const)(
    "accepts capability %s",
    async (capability) => {
      create.mockResolvedValueOnce({
        output_text: JSON.stringify(providerUnderstanding({ externalEvidenceNeed: { capability, query: "test query" } })),
      });
      await expect(classifyConversation({ message: "test" })).resolves.toMatchObject({
        externalEvidenceNeed: { capability, query: "test query" },
      });
    },
  );

  it("falls back to the safe deterministic default when the provider sends an invalid capability", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ externalEvidenceNeed: { capability: "ANYTHING_GOES", query: "x" } })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.externalEvidenceNeed).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.shouldAskClarification).toBe(true);
  });

  it("falls back to the safe deterministic default when query is missing", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ externalEvidenceNeed: { capability: "WEB_SEARCH" } })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.externalEvidenceNeed).toBeNull();
  });
});
