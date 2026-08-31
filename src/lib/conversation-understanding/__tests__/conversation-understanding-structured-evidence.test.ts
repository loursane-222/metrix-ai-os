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

function providerUnderstanding(externalEvidenceNeed: Record<string, unknown>) {
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
    externalEvidenceNeed,
    reasoning: { summary: "s", observations: [], uncertainty: [], whyThisHandling: "w" },
  };
}

describe("conversation understanding — Phase C structured evidence capabilities", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("preserves valid CURRENCY params", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "CURRENCY", query: "1000 EUR kaç TRY", currency: { amount: 1000, base: "eur", quote: "try" },
    })) });
    const result = await classifyConversation({ message: "1000 euro kaç TL?" });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "CURRENCY", currency: { amount: 1000, base: "EUR", quote: "TRY" } });
  });

  it("rejects CURRENCY when the params are missing/invalid", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "CURRENCY", query: "kaç para eder", currency: null,
    })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.externalEvidenceNeed).toBeNull();
  });

  it("preserves valid WEATHER params", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "WEATHER", query: "yarın Ankara hava durumu", weather: { location: "Ankara", when: "tomorrow" },
    })) });
    const result = await classifyConversation({ message: "yarın Ankara'da hava nasıl?" });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "WEATHER", weather: { location: "Ankara", when: "tomorrow" } });
  });

  it("preserves valid PLACES params with a null near", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "PLACES", query: "İtalyan restoranı", places: { query: "İtalyan restoranı", near: null },
    })) });
    const result = await classifyConversation({ message: "İtalyan restoranı bul" });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "PLACES", places: { query: "İtalyan restoranı", near: null } });
  });

  it("preserves valid ROUTES params", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "ROUTES", query: "İzmir'den Bursa'ya süre", routes: { origin: "İzmir", destination: "Bursa" },
    })) });
    const result = await classifyConversation({ message: "İzmir'den Bursa'ya arabayla kaç saat?" });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "ROUTES", routes: { origin: "İzmir", destination: "Bursa" } });
  });

  it("falls back safely when ROUTES is missing its destination", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      capability: "ROUTES", query: "nereye kaç sürer", routes: { origin: "İzmir" },
    })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.externalEvidenceNeed).toBeNull();
  });
});
