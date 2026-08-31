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

function providerUnderstanding(externalEvidenceNeed: Record<string, unknown> | null) {
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

// Regression suite for the 2026-09-01 production freshness regression:
// "Bugün OpenAI ile ilgili en önemli güncel gelişme nedir?" surfaced a
// ~7-week-old announcement as "today's" development. Root cause: the
// externalEvidenceNeed contract had no place to carry the user's explicit
// temporal intent, so it never survived past the free-text query. These
// tests prove the new `recency` field round-trips through the existing
// single classification call — no second classifier is added anywhere here.
describe("conversation understanding — freshness/recency contract (Phase B temporal semantics)", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("1. represents the exact production prompt as freshness-sensitive (recency: today)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "CURRENT_NEWS",
        query: "OpenAI bugünkü en önemli güncel gelişme",
        recency: "today",
      })),
    });
    await expect(
      classifyConversation({ message: "Bugün OpenAI ile ilgili en önemli güncel gelişme nedir?" }),
    ).resolves.toMatchObject({
      externalEvidenceNeed: { capability: "CURRENT_NEWS", recency: "today" },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("2. preserves latest/most-recent semantics for 'en son gelişme'", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "CURRENT_NEWS",
        query: "OpenAI en son gelişme",
        recency: "latest",
      })),
    });
    await expect(
      classifyConversation({ message: "OpenAI ile ilgili en son gelişme nedir?" }),
    ).resolves.toMatchObject({
      externalEvidenceNeed: { capability: "CURRENT_NEWS", recency: "latest" },
    });
  });

  it("3. preserves current-week semantics for 'bu hafta'", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "CURRENT_NEWS",
        query: "OpenAI bu hafta yaşanan gelişmeler",
        recency: "this_week",
      })),
    });
    await expect(
      classifyConversation({ message: "Bu hafta OpenAI ile ilgili ne oldu?" }),
    ).resolves.toMatchObject({
      externalEvidenceNeed: { capability: "CURRENT_NEWS", recency: "this_week" },
    });
  });

  it("4. keeps ordinary topical research unforced ('OpenAI hakkında bilgi ver' → recency any)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "COMPANY_RESEARCH",
        query: "OpenAI şirket profili",
        recency: "any",
      })),
    });
    await expect(
      classifyConversation({ message: "OpenAI hakkında bilgi ver." }),
    ).resolves.toMatchObject({
      externalEvidenceNeed: { capability: "COMPANY_RESEARCH", recency: "any" },
    });
  });

  it("5. keeps a historical/product question from being forced into current-news research", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "WEB_SEARCH",
        query: "GPT-5.6 nedir",
        recency: "any",
      })),
    });
    const result = await classifyConversation({ message: "GPT-5.6 nedir?" });
    expect(result.externalEvidenceNeed?.capability).not.toBe("CURRENT_NEWS");
    expect(result.externalEvidenceNeed?.recency).toBe("any");
  });

  it("normalizes a missing recency to 'any' rather than failing the whole evidence need closed", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "WEB_SEARCH",
        query: "Microsoft resmi web sitesi",
      })),
    });
    const result = await classifyConversation({ message: "Microsoft'un web sitesini bul." });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "WEB_SEARCH", recency: "any" });
  });

  it("normalizes an invalid recency value to 'any' rather than failing the whole evidence need closed", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify(providerUnderstanding({
        capability: "CURRENT_NEWS",
        query: "OpenAI gelişmeleri",
        recency: "yesterday_or_whenever",
      })),
    });
    const result = await classifyConversation({ message: "OpenAI ile ilgili ne var?" });
    expect(result.externalEvidenceNeed).toMatchObject({ capability: "CURRENT_NEWS", recency: "any" });
  });

  it("9. leaves internal-company-truth suppression unchanged — businessNavigation turns still get externalEvidenceNeed null regardless of recency", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify({
        ...providerUnderstanding(null),
        conversationKind: "company_related",
        companyRelevance: "high",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
        businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
      }),
    });
    await expect(
      classifyConversation({ message: "Geçen ay tahsilatımız ne kadar?" }),
    ).resolves.toMatchObject({
      businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
      externalEvidenceNeed: null,
    });
  });
});
