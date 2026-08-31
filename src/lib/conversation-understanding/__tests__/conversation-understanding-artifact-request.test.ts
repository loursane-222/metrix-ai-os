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
    artifactRequest: { format: "XLSX", dataset: "collections", period: "last_month" },
    reasoning: { summary: "s", observations: [], uncertainty: [], whyThisHandling: "w" },
    ...overrides,
  };
}

describe("conversation understanding — Phase D1/D2 artifact request recognition", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("preserves a valid collections Excel export request", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding()) });
    const result = await classifyConversation({ message: "Bana geçen ayki tahsilatlarımı Excel olarak ver." });
    expect(result.artifactRequest).toEqual({ format: "XLSX", dataset: "collections", period: "last_month" });
  });

  it.each(["DOCX", "PDF"] as const)("preserves a valid collections %s export request (Phase D2)", async (format) => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      artifactRequest: { format, dataset: "collections", period: "last_month" },
    })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.artifactRequest).toEqual({ format, dataset: "collections", period: "last_month" });
  });

  it("rejects an unsupported dataset and falls back safely rather than guessing", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      artifactRequest: { format: "XLSX", dataset: "invoices", period: "last_month" },
    })) });
    const result = await classifyConversation({ message: "faturaları excel yap" });
    expect(result.artifactRequest).toBeNull();
  });

  it("rejects an unsupported format (PPTX — not implemented until a future phase)", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      artifactRequest: { format: "PPTX", dataset: "collections", period: "last_month" },
    })) });
    const result = await classifyConversation({ message: "pptx yap" });
    expect(result.artifactRequest).toBeNull();
  });

  it("rejects an unsupported period", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      artifactRequest: { format: "XLSX", dataset: "collections", period: "this_month" },
    })) });
    const result = await classifyConversation({ message: "bu ayki tahsilatlar excel" });
    expect(result.artifactRequest).toBeNull();
  });

  it("accepts a plain display request with no artifact intent (businessNavigation only)", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({
      shouldInvokeExecutiveBrain: true,
      suggestedHandling: "executive_reasoning",
      businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
      artifactRequest: null,
    })) });
    const result = await classifyConversation({ message: "Tahsilatlarımı göster." });
    expect(result.artifactRequest).toBeNull();
    expect(result.businessNavigation).toMatchObject({ domain: "payment", target: "list" });
  });
});
