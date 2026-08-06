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

function providerUnderstanding(domain: "company" | "customer" | "offer" | "product" | "task" | "accounting", target: "root" | "list" | "create") {
  return {
    conversationKind: "company_related",
    userMotivation: target === "create" ? "kayit_islem" : "bilgi_almak",
    companyRelevance: "high",
    actionExpectation: "explicit",
    confidence: "high",
    shouldAskClarification: false,
    clarificationQuestion: null,
    shouldInvokeExecutiveBrain: true,
    suggestedHandling: "executive_reasoning",
    businessNavigation: { operation: "NAVIGATE", domain, target, entityReference: null },
    reasoning: { summary: "Canonical provider understanding.", observations: [], uncertainty: [], whyThisHandling: "The user requested a business surface." },
  } as const;
}

describe("canonical conversation understanding navigation", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it.each([
    ["Şirketimi göster", "company", "root"],
    ["Müşterileri göster", "customer", "list"],
    ["Yeni müşteri oluştur", "customer", "create"],
    ["Teklifleri aç", "offer", "list"],
    ["Ürünleri göster", "product", "list"],
    ["Yeni görev oluştur", "task", "create"],
    ["Finansal özetimi göster", "accounting", "root"],
    ["Muhasebe durumu ne", "accounting", "root"],
  ] as const)("preserves typed navigation from the canonical provider for %s", async (message, domain, target) => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding(domain, target)) });
    await expect(classifyConversation({ message })).resolves.toMatchObject({
      businessNavigation: { operation: "NAVIGATE", domain, target, entityReference: null },
    });
    expect(create).toHaveBeenCalledOnce();
  });
});
