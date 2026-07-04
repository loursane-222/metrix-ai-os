import { vi, describe, it, expect, beforeEach } from "vitest";
import { parseExecutiveContextV2 } from "../executive-context-builder.parser";
import { buildExecutiveContextV2 } from "../executive-context-builder.service";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveContextV2 } from "../executive-context-builder.types";

// ─── Gateway Mock ──────────────────────────────────────────────────────────────

vi.mock("../executive-context-builder.gateway", () => ({
  generateExecutiveContextV2Raw: vi.fn(),
}));

import { generateExecutiveContextV2Raw } from "../executive-context-builder.gateway";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_UNDERSTANDING: ConversationUnderstanding = {
  conversationKind: "company_related",
  userMotivation: "karar_destegi",
  companyRelevance: "high",
  actionExpectation: "explicit",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: true,
  suggestedHandling: "executive_reasoning",
  reasoning: {
    summary: "Kullanıcı kritik bir iş kararı için bağlam sunuyor.",
    observations: ["Müşteri riski var"],
    uncertainty: [],
    whyThisHandling: "Yönetici muhakemesi gerekiyor.",
  },
};

const VALID_CONTEXT_PAYLOAD = {
  situationSummary: "Müşteri ödeme riski yüksek.",
  weight: "critical",
  intentClarity: "clear",
  timeHorizon: "immediate",
  stakeholders: [{ mentioned: "Ahmet", role: "customer", confidence: "high" }],
  knowledgeGaps: [],
  canProceed: true,
  proceedRationale: "Tüm bilgi mevcut.",
};

// ─── Parser Unit Tests ────────────────────────────────────────────────────────

describe("parseExecutiveContextV2 — geçerli JSON", () => {
  it("geçerli payload → ExecutiveContextV2 döner", () => {
    const raw = JSON.stringify(VALID_CONTEXT_PAYLOAD);
    const result = parseExecutiveContextV2(raw, MOCK_UNDERSTANDING);

    expect(result.situationSummary).toBe("Müşteri ödeme riski yüksek.");
    expect(result.weight).toBe("critical");
    expect(result.intentClarity).toBe("clear");
    expect(result.timeHorizon).toBe("immediate");
    expect(result.canProceed).toBe(true);
    expect(result.proceedRationale).toBe("Tüm bilgi mevcut.");
  });

  it("assembledFrom dışarıdan enjekte edilir", () => {
    const raw = JSON.stringify(VALID_CONTEXT_PAYLOAD);
    const result = parseExecutiveContextV2(raw, MOCK_UNDERSTANDING);

    expect(result.assembledFrom).toBe(MOCK_UNDERSTANDING);
    expect(result.assembledFrom.conversationKind).toBe("company_related");
  });

  it("stakeholders dizisi taşınır", () => {
    const raw = JSON.stringify(VALID_CONTEXT_PAYLOAD);
    const result = parseExecutiveContextV2(raw, MOCK_UNDERSTANDING);

    expect(result.stakeholders).toHaveLength(1);
    expect(result.stakeholders[0].mentioned).toBe("Ahmet");
  });

  it("boş stakeholders geçerlidir", () => {
    const raw = JSON.stringify({ ...VALID_CONTEXT_PAYLOAD, stakeholders: [] });
    const result = parseExecutiveContextV2(raw, MOCK_UNDERSTANDING);

    expect(result.stakeholders).toHaveLength(0);
  });

  it("boş knowledgeGaps geçerlidir", () => {
    const raw = JSON.stringify({ ...VALID_CONTEXT_PAYLOAD, knowledgeGaps: [] });
    const result = parseExecutiveContextV2(raw, MOCK_UNDERSTANDING);

    expect(result.knowledgeGaps).toHaveLength(0);
  });
});

describe("parseExecutiveContextV2 — hata durumları", () => {
  it("geçersiz JSON string → throw", () => {
    expect(() =>
      parseExecutiveContextV2("bu json değil {{{", MOCK_UNDERSTANDING),
    ).toThrow("ExecutiveContextV2: JSON parse başarısız.");
  });

  it("boş string → throw", () => {
    expect(() =>
      parseExecutiveContextV2("", MOCK_UNDERSTANDING),
    ).toThrow("ExecutiveContextV2: JSON parse başarısız.");
  });

  it("JSON array → throw (nesne değil)", () => {
    expect(() =>
      parseExecutiveContextV2("[]", MOCK_UNDERSTANDING),
    ).toThrow("ExecutiveContextV2: LLM yanıtı geçerli bir nesne değil.");
  });

  it("JSON null → throw", () => {
    expect(() =>
      parseExecutiveContextV2("null", MOCK_UNDERSTANDING),
    ).toThrow("ExecutiveContextV2: LLM yanıtı geçerli bir nesne değil.");
  });

  it("JSON string primitive → throw", () => {
    expect(() =>
      parseExecutiveContextV2('"sadece string"', MOCK_UNDERSTANDING),
    ).toThrow("ExecutiveContextV2: LLM yanıtı geçerli bir nesne değil.");
  });

  it("situationSummary eksik → throw", () => {
    const { situationSummary: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "situationSummary".');
  });

  it("weight eksik → throw", () => {
    const { weight: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "weight".');
  });

  it("intentClarity eksik → throw", () => {
    const { intentClarity: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "intentClarity".');
  });

  it("timeHorizon eksik → throw", () => {
    const { timeHorizon: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "timeHorizon".');
  });

  it("stakeholders eksik → throw", () => {
    const { stakeholders: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "stakeholders".');
  });

  it("knowledgeGaps eksik → throw", () => {
    const { knowledgeGaps: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "knowledgeGaps".');
  });

  it("canProceed eksik → throw", () => {
    const { canProceed: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "canProceed".');
  });

  it("proceedRationale eksik → throw", () => {
    const { proceedRationale: _, ...rest } = VALID_CONTEXT_PAYLOAD;
    expect(() =>
      parseExecutiveContextV2(JSON.stringify(rest), MOCK_UNDERSTANDING),
    ).toThrow('ExecutiveContextV2: Zorunlu alan eksik: "proceedRationale".');
  });
});

// ─── Service Integration Tests ────────────────────────────────────────────────

describe("buildExecutiveContextV2 — servis akışı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gateway çağrılır; parser sonucu döner", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockResolvedValue(
      JSON.stringify(VALID_CONTEXT_PAYLOAD),
    );

    const result = await buildExecutiveContextV2({
      message: "Müşteri ödeme yapmadı.",
      understanding: MOCK_UNDERSTANDING,
    });

    expect(vi.mocked(generateExecutiveContextV2Raw)).toHaveBeenCalledOnce();
    expect(vi.mocked(generateExecutiveContextV2Raw)).toHaveBeenCalledWith(
      "Müşteri ödeme yapmadı.",
      MOCK_UNDERSTANDING,
    );
    expect(result.situationSummary).toBe("Müşteri ödeme riski yüksek.");
    expect(result.assembledFrom).toBe(MOCK_UNDERSTANDING);
  });

  it("gateway doğru argümanlarla çağrılıyor: message ve understanding", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockResolvedValue(
      JSON.stringify(VALID_CONTEXT_PAYLOAD),
    );

    const customUnderstanding: ConversationUnderstanding = {
      ...MOCK_UNDERSTANDING,
      conversationKind: "mixed",
    };

    await buildExecutiveContextV2({
      message: "test mesajı",
      understanding: customUnderstanding,
    });

    const [calledMessage, calledUnderstanding] =
      vi.mocked(generateExecutiveContextV2Raw).mock.calls[0];
    expect(calledMessage).toBe("test mesajı");
    expect(calledUnderstanding).toBe(customUnderstanding);
  });

  it("gateway hata verirse propagate eder", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockRejectedValue(
      new Error("OPENAI_API_KEY is not configured."),
    );

    await expect(
      buildExecutiveContextV2({
        message: "test",
        understanding: MOCK_UNDERSTANDING,
      }),
    ).rejects.toThrow("OPENAI_API_KEY is not configured.");
  });

  it("gateway boş yanıt hatası propagate eder", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockRejectedValue(
      new Error("ExecutiveContextV2: LLM boş yanıt döndürdü."),
    );

    await expect(
      buildExecutiveContextV2({
        message: "test",
        understanding: MOCK_UNDERSTANDING,
      }),
    ).rejects.toThrow("ExecutiveContextV2: LLM boş yanıt döndürdü.");
  });

  it("gateway geçersiz JSON dönerse parser throw eder ve propagate olur", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockResolvedValue("geçersiz{{{");

    await expect(
      buildExecutiveContextV2({
        message: "test",
        understanding: MOCK_UNDERSTANDING,
      }),
    ).rejects.toThrow("ExecutiveContextV2: JSON parse başarısız.");
  });

  it("gateway eksik alan içeren JSON dönerse parser throw eder ve propagate olur", async () => {
    const { weight: _, ...withoutWeight } = VALID_CONTEXT_PAYLOAD;
    vi.mocked(generateExecutiveContextV2Raw).mockResolvedValue(
      JSON.stringify(withoutWeight),
    );

    await expect(
      buildExecutiveContextV2({
        message: "test",
        understanding: MOCK_UNDERSTANDING,
      }),
    ).rejects.toThrow('ExecutiveContextV2: Zorunlu alan eksik: "weight".');
  });

  it("sonuç ExecutiveContextV2 shape'ine uyuyor", async () => {
    vi.mocked(generateExecutiveContextV2Raw).mockResolvedValue(
      JSON.stringify(VALID_CONTEXT_PAYLOAD),
    );

    const result = await buildExecutiveContextV2({
      message: "test",
      understanding: MOCK_UNDERSTANDING,
    });

    const shape: ExecutiveContextV2 = result;
    expect(shape).toHaveProperty("situationSummary");
    expect(shape).toHaveProperty("weight");
    expect(shape).toHaveProperty("intentClarity");
    expect(shape).toHaveProperty("timeHorizon");
    expect(shape).toHaveProperty("stakeholders");
    expect(shape).toHaveProperty("knowledgeGaps");
    expect(shape).toHaveProperty("canProceed");
    expect(shape).toHaveProperty("proceedRationale");
    expect(shape).toHaveProperty("assembledFrom");
  });
});
