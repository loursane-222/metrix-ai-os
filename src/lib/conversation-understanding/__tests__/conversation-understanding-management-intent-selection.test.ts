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
    conversationKind: "company_related",
    userMotivation: "bilgi_almak",
    companyRelevance: "high",
    actionExpectation: "none",
    confidence: "high",
    shouldAskClarification: false,
    clarificationQuestion: null,
    shouldInvokeExecutiveBrain: false,
    suggestedHandling: "answer_only",
    businessNavigation: null,
    externalEvidenceNeed: null,
    reasoning: { summary: "s", observations: [], uncertainty: [], whyThisHandling: "w" },
    ...overrides,
  };
}

describe("conversation understanding — LLM-selected managementIntent (open-ended read capability)", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("accepts a valid atomic managementIntent (no sub-fields) from the provider", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ managementIntent: { intent: "CASH_POSITION" } })),
    });
    await expect(classifyConversation({ message: "Kasada şu an ne kadar param var?" })).resolves.toMatchObject({
      managementIntent: { intent: "CASH_POSITION" },
    });
  });

  it("accepts a valid managementIntent with queryMode (RECEIVABLE_POSITION)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        managementIntent: { intent: "RECEIVABLE_POSITION", queryMode: "OVERDUE" },
      })),
    });
    await expect(classifyConversation({ message: "Müşterilerden alacaklarımızda geciken var mı?" })).resolves.toMatchObject({
      managementIntent: { intent: "RECEIVABLE_POSITION", queryMode: "OVERDUE" },
    });
  });

  it("accepts a valid managementIntent with period+queryMode+activity+countMode (QUOTE_ACTIVITY)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        managementIntent: { intent: "QUOTE_ACTIVITY", activity: "SENT", countMode: "DISTINCT_QUOTES", period: "CURRENT_MONTH" },
      })),
    });
    await expect(classifyConversation({ message: "Bu ay kaç teklif gönderdik?" })).resolves.toMatchObject({
      managementIntent: { intent: "QUOTE_ACTIVITY", activity: "SENT", countMode: "DISTINCT_QUOTES", period: "CURRENT_MONTH" },
    });
  });

  it("accepts a valid COLLECTION_COMPARISON (week variant)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        managementIntent: { intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_WEEK", comparablePeriod: "PREVIOUS_WEEK" },
      })),
    });
    await expect(classifyConversation({ message: "Bu hafta tahsilat geçen haftaya göre nasıl?" })).resolves.toMatchObject({
      managementIntent: { intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_WEEK", comparablePeriod: "PREVIOUS_WEEK" },
    });
  });

  it("accepts null managementIntent for ordinary company-related turns", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ managementIntent: null })),
    });
    await expect(classifyConversation({ message: "Atlas İnşaat hakkında bilgi ver." })).resolves.toMatchObject({
      managementIntent: null,
    });
  });

  it("accepts an understanding that omits managementIntent entirely (defaults to null)", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding()) });
    await expect(classifyConversation({ message: "Selam." })).resolves.toMatchObject({
      managementIntent: null,
    });
  });

  it("falls back to the safe deterministic default when intent is not in the closed union", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ managementIntent: { intent: "MADE_UP_MEASURE" } })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.managementIntent).toBeUndefined();
    expect(result.confidence).toBe("low");
    expect(result.shouldAskClarification).toBe(true);
  });

  it("falls back to the safe deterministic default when queryMode is missing for an intent that requires it", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({ managementIntent: { intent: "RECEIVABLE_POSITION" } })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("falls back to the safe deterministic default when queryMode is not in that intent's closed set", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        managementIntent: { intent: "RECEIVABLE_POSITION", queryMode: "COUNTERPARTY_OVERDUE_RANKING" },
      })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("falls back to the safe deterministic default when COLLECTION_COMPARISON mixes week/month periods", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        managementIntent: { intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_WEEK", comparablePeriod: "PREVIOUS_MONTH" },
      })),
    });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });
});
