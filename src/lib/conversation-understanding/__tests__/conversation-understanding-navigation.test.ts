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

function providerUnderstanding(domain: "company" | "customer" | "offer" | "product" | "task" | "calendar" | "accounting", target: "root" | "list" | "create") {
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
    ["Takvimi aç", "calendar", "root"],
    ["Finansal özetimi göster", "accounting", "root"],
    ["Muhasebe durumu ne", "accounting", "root"],
  ] as const)("preserves typed navigation from the canonical provider for %s", async (message, domain, target) => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding(domain, target)) });
    await expect(classifyConversation({ message })).resolves.toMatchObject({
      businessNavigation: { operation: "NAVIGATE", domain, target, entityReference: null },
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it.each([
    ["Bugünkü programımı göster", "day", { kind: "today" }],
    ["Yarınki programımı göster", "day", { kind: "tomorrow" }],
    ["Bu haftayı göster", "week", null],
    ["Bu ayı göster", "month", null],
    ["15 Eylül programımı göster", "day", { kind: "explicit", day: 15, month: 9 }],
  ] as const)("preserves Calendar view/date refinement for %s", async (message, calendarView, calendarDate) => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify({
        ...providerUnderstanding("calendar", "root"),
        businessNavigation: { operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView, calendarDate },
      }),
    });
    await expect(classifyConversation({ message })).resolves.toMatchObject({
      businessNavigation: { domain: "calendar", target: "root", calendarView, calendarDate },
    });
  });

  it("rejects a fabricated calendarView it cannot recognize, falling back to safe clarification", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify({
        ...providerUnderstanding("calendar", "root"),
        businessNavigation: { operation: "NAVIGATE", domain: "calendar", target: "root", entityReference: null, calendarView: "year", calendarDate: null },
      }),
    });
    await expect(classifyConversation({ message: "Takvimi yıllık göster" })).resolves.toMatchObject({ shouldAskClarification: true, businessNavigation: null });
  });

  it("preserves a workspaceControl close request, domain-agnostic (no businessNavigation involved)", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify({
        conversationKind: "company_related", userMotivation: "belirsiz", companyRelevance: "low",
        actionExpectation: "none", confidence: "high", shouldAskClarification: false, shouldInvokeExecutiveBrain: false,
        suggestedHandling: "answer_only", businessNavigation: null, workspaceControl: "close",
        reasoning: { summary: "User asked to close the open surface.", observations: [], uncertainty: [], whyThisHandling: "Explicit close request." },
      }),
    });
    await expect(classifyConversation({ message: "Teklif sayfasını kapat, sohbete dön." })).resolves.toMatchObject({ workspaceControl: "close", businessNavigation: null });
  });

  it("falls back to a safe null workspaceControl when the provider sends an invalid value", async () => {
    create.mockResolvedValueOnce({
      output_text: JSON.stringify({
        conversationKind: "company_related", userMotivation: "belirsiz", companyRelevance: "low",
        actionExpectation: "none", confidence: "high", shouldAskClarification: false, shouldInvokeExecutiveBrain: false,
        suggestedHandling: "answer_only", businessNavigation: null, workspaceControl: "open",
        reasoning: { summary: "x", observations: [], uncertainty: [], whyThisHandling: "x" },
      }),
    });
    await expect(classifyConversation({ message: "x" })).resolves.toMatchObject({ workspaceControl: null, shouldAskClarification: true });
  });
});
