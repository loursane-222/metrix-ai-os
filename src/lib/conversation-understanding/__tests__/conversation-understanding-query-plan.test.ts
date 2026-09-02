import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

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
    managementIntent: null,
    externalEvidenceNeed: null,
    reasoning: { summary: "s", observations: [], uncertainty: [], whyThisHandling: "w" },
    ...overrides,
  };
}

describe("conversation understanding — queryPlan (Company Query Authority selection)", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("accepts a valid customer_set plan with a 3-step BASE/EXCEPT/INTERSECT pipeline", async () => {
    const plan = {
      scope: "customer_set",
      setPipeline: [
        { set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" },
        { set: "CUSTOMERS_WITH_CONFIRMED_ORDER", op: "EXCEPT" },
        { set: "CUSTOMERS_WITH_RECEIVABLE_BALANCE", op: "INTERSECT" },
      ],
      dateRange: { kind: "LAST_N_DAYS", days: 90 },
      judgmentNeed: false,
    };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    await expect(classifyConversation({ message: "test" })).resolves.toMatchObject({ queryPlan: plan });
  });

  it("accepts a valid single_customer plan", async () => {
    const plan = {
      scope: "single_customer",
      customerReference: "Atlas",
      facts: ["QUOTE_HISTORY", "ORDER_HISTORY", "RECEIVABLE_POSITION", "COMMERCIAL_TERMS"],
      dateRange: null,
      conversationTopicKeywords: null,
      judgmentNeed: true,
    };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    await expect(classifyConversation({ message: "test" })).resolves.toMatchObject({ queryPlan: plan });
  });

  it("accepts null queryPlan for ordinary turns", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: null })) });
    await expect(classifyConversation({ message: "test" })).resolves.toMatchObject({ queryPlan: null });
  });

  it("rejects a set pipeline whose first step is not BASE", async () => {
    const plan = { scope: "customer_set", setPipeline: [{ set: "CUSTOMERS_WITH_QUOTE_SENT", op: "INTERSECT" }], dateRange: null, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
    expect(result.queryPlan).toBeUndefined();
  });

  it("rejects an invented entity set name not in the closed list — no silent fallback to a made-up filter", async () => {
    const plan = { scope: "customer_set", setPipeline: [{ set: "CUSTOMERS_WHO_LIKE_US", op: "BASE" }], dateRange: null, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("rejects a setPipeline longer than 4 steps", async () => {
    const step = { set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" };
    const plan = { scope: "customer_set", setPipeline: [step, step, step, step, step], dateRange: null, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("rejects a LAST_N_DAYS range outside the sane 1-366 bound", async () => {
    const plan = { scope: "customer_set", setPipeline: [{ set: "CUSTOMERS_WITH_QUOTE_SENT", op: "BASE" }], dateRange: { kind: "LAST_N_DAYS", days: 5000 }, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("rejects single_customer with an empty facts array", async () => {
    const plan = { scope: "single_customer", customerReference: "Atlas", facts: [], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("rejects single_customer with a blank customerReference (no fabricated identity)", async () => {
    const plan = { scope: "single_customer", customerReference: "  ", facts: ["QUOTE_HISTORY"], dateRange: null, conversationTopicKeywords: null, judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("rejects an unknown scope value", async () => {
    const plan = { scope: "company_wide_everything", judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.shouldAskClarification).toBe(true);
  });

  it("drops non-string entries from conversationTopicKeywords rather than failing the whole plan", async () => {
    const plan = { scope: "single_customer", customerReference: "Atlas", facts: ["CONVERSATION_HISTORY"], dateRange: null, conversationTopicKeywords: ["ödeme planı", 42, ""], judgmentNeed: false };
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding({ queryPlan: plan })) });
    const result = await classifyConversation({ message: "test" });
    expect(result.queryPlan).toMatchObject({ conversationTopicKeywords: ["ödeme planı"] });
  });
});
