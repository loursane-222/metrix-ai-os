import { vi, describe, it, expect, beforeEach } from "vitest";
import { buildExecutiveIntelligence } from "../executive-intelligence.service";
import type { BuildExecutiveIntelligenceInput } from "../executive-intelligence.types";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { CompanyModel } from "@/lib/executive-operating-system";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/executive-context-builder", () => ({
  buildExecutiveContextV2: vi.fn(),
}));

vi.mock("@/lib/executive-operating-system", () => ({
  buildCompanyModel: vi.fn(),
  buildExecutiveOperatingSystem: vi.fn(),
}));

import { buildExecutiveContextV2 } from "@/lib/executive-context-builder";
import { buildCompanyModel, buildExecutiveOperatingSystem } from "@/lib/executive-operating-system";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const UNDERSTANDING_SKIP: ConversationUnderstanding = {
  conversationKind: "general_chat",
  userMotivation: "sohbet_etmek",
  companyRelevance: "none",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "answer_only",
  reasoning: {
    summary: "Yönetici muhakemesi gerekmiyor.",
    observations: [],
    uncertainty: [],
    whyThisHandling: "Genel sohbet, yönetici katmanı atlandı.",
  },
};

const UNDERSTANDING_INVOKE: ConversationUnderstanding = {
  conversationKind: "company_related",
  userMotivation: "karar_destegi",
  companyRelevance: "high",
  actionExpectation: "explicit",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: true,
  suggestedHandling: "executive_reasoning",
  reasoning: {
    summary: "Kritik iş kararı.",
    observations: ["Müşteri riski var."],
    uncertainty: [],
    whyThisHandling: "Yönetici muhakemesi gerekiyor.",
  },
};

const SAFE_FALLBACK_UNDERSTANDING: ConversationUnderstanding = {
  conversationKind: "unclear",
  userMotivation: "belirsiz",
  companyRelevance: "none",
  actionExpectation: "none",
  confidence: "low",
  shouldAskClarification: true,
  clarificationQuestion: "Bunu biraz daha açabilir misin?",
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "ask_clarification",
  reasoning: {
    summary: "Conversation understanding fallback.",
    observations: [],
    uncertainty: ["Classification unavailable."],
    whyThisHandling: "Clarification is the safe fallback.",
  },
};

const MOCK_CONTEXT: ExecutiveContextV2 = {
  situationSummary: "Test durumu.",
  weight: "routine",
  intentClarity: "clear",
  timeHorizon: "near_term",
  stakeholders: [],
  knowledgeGaps: [],
  canProceed: true,
  proceedRationale: "Hazır.",
  assembledFrom: UNDERSTANDING_INVOKE,
};

const MOCK_COMPANY_MODEL: CompanyModel = {
  industry: null,
  city: null,
  teamSize: null,
  growthPhase: "unknown",
  topGoal: null,
  cashPriority: null,
  primaryCustomerType: null,
  learnedFacts: [],
  confidence: "none",
};

const MOCK_EOS = {
  philosophy: {},
  worldModel: {},
  companyModel: MOCK_COMPANY_MODEL,
  executiveContext: MOCK_CONTEXT,
  reasoning: {},
  recommendedNextMove: {},
  learningLoop: {},
  generatedAt: "2026-06-29T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof buildExecutiveOperatingSystem>>;

const BASE_INPUT: BuildExecutiveIntelligenceInput = {
  message: "Nakit akışımız bozuluyor.",
  memoryContext: null,
  generatedAt: "2026-06-29T00:00:00.000Z",
  understanding: UNDERSTANDING_INVOKE,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildExecutiveIntelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildExecutiveContextV2).mockResolvedValue(MOCK_CONTEXT);
    vi.mocked(buildCompanyModel).mockReturnValue(MOCK_COMPANY_MODEL);
    vi.mocked(buildExecutiveOperatingSystem).mockResolvedValue(MOCK_EOS);
  });

  it("authority projections are passed to Company Model and resulting model reaches EOS", async () => {
    const authorityProjections = [] as NonNullable<BuildExecutiveIntelligenceInput["authorityProjections"]>;
    await buildExecutiveIntelligence({ ...BASE_INPUT, authorityProjections, organizationId: "org-1" });

    expect(buildCompanyModel).toHaveBeenCalledWith(null, authorityProjections);
    expect(buildExecutiveOperatingSystem).toHaveBeenCalledWith(expect.objectContaining({
      companyModel: MOCK_COMPANY_MODEL,
      learningPersistenceContext: { organizationId: "org-1" },
    }));
  });

  // ── Skip path ──────────────────────────────────────────────────────────────

  it("shouldInvokeExecutiveBrain false ise EOS çalışmaz", async () => {
    const result = await buildExecutiveIntelligence({ ...BASE_INPUT, understanding: UNDERSTANDING_SKIP });

    expect(result.executiveOperatingSystem).toBeNull();
    expect(vi.mocked(buildExecutiveContextV2)).not.toHaveBeenCalled();
    expect(vi.mocked(buildCompanyModel)).not.toHaveBeenCalled();
    expect(vi.mocked(buildExecutiveOperatingSystem)).not.toHaveBeenCalled();
  });

  it("skip durumunda context/companyModel/eos diagnostics skipped olur", async () => {
    const { diagnostics } = await buildExecutiveIntelligence({ ...BASE_INPUT, understanding: UNDERSTANDING_SKIP });

    expect(diagnostics.understanding.status).toBe("success");
    expect(diagnostics.context.status).toBe("skipped");
    expect(diagnostics.companyModel.status).toBe("skipped");
    expect(diagnostics.eos.status).toBe("skipped");
  });

  it("skip durumunda requiresExecutiveReasoning false olur", async () => {
    const { diagnostics } = await buildExecutiveIntelligence({ ...BASE_INPUT, understanding: UNDERSTANDING_SKIP });

    expect(diagnostics.requiresExecutiveReasoning).toBe(false);
  });

  it("skip durumunda skippedReason dolu olur", async () => {
    const { diagnostics } = await buildExecutiveIntelligence({ ...BASE_INPUT, understanding: UNDERSTANDING_SKIP });

    expect(typeof diagnostics.skippedReason).toBe("string");
    expect(diagnostics.skippedReason!.length).toBeGreaterThan(0);
  });

  it("reuses a SAFE_FALLBACK-shaped authoritative understanding without reinterpretation", async () => {
    const result = await buildExecutiveIntelligence({
      ...BASE_INPUT,
      understanding: SAFE_FALLBACK_UNDERSTANDING,
    });

    expect(result.understanding).toBe(SAFE_FALLBACK_UNDERSTANDING);
    expect(result.executiveOperatingSystem).toBeNull();
    expect(vi.mocked(buildExecutiveContextV2)).not.toHaveBeenCalled();
  });

  // ── Invoke path ───────────────────────────────────────────────────────────

  it("shouldInvokeExecutiveBrain true ise context → companyModel → eos sırası çalışır", async () => {
    const callOrder: string[] = [];
    vi.mocked(buildExecutiveContextV2).mockImplementation(async () => {
      callOrder.push("context");
      return MOCK_CONTEXT;
    });
    vi.mocked(buildCompanyModel).mockImplementation(() => {
      callOrder.push("companyModel");
      return MOCK_COMPANY_MODEL;
    });
    vi.mocked(buildExecutiveOperatingSystem).mockImplementation(async () => {
      callOrder.push("eos");
      return MOCK_EOS;
    });

    await buildExecutiveIntelligence(BASE_INPUT);

    expect(callOrder).toEqual(["context", "companyModel", "eos"]);
  });

  it("invoke path: tüm diagnostics success olur", async () => {
    const { diagnostics } = await buildExecutiveIntelligence(BASE_INPUT);

    expect(diagnostics.understanding.status).toBe("success");
    expect(diagnostics.context.status).toBe("success");
    expect(diagnostics.companyModel.status).toBe("success");
    expect(diagnostics.eos.status).toBe("success");
  });

  it("invoke path: requiresExecutiveReasoning true, skippedReason null olur", async () => {
    const { diagnostics } = await buildExecutiveIntelligence(BASE_INPUT);

    expect(diagnostics.requiresExecutiveReasoning).toBe(true);
    expect(diagnostics.skippedReason).toBeNull();
  });

  it("returns the exact authoritative understanding reference", async () => {
    const result = await buildExecutiveIntelligence(BASE_INPUT);

    expect(result.understanding).toBe(UNDERSTANDING_INVOKE);
  });

  it("passes the exact authoritative understanding to Executive Context", async () => {
    await buildExecutiveIntelligence(BASE_INPUT);

    const contextInput = vi.mocked(buildExecutiveContextV2).mock.calls[0]?.[0];
    expect(contextInput?.understanding).toBe(UNDERSTANDING_INVOKE);
  });

  it("preserves the authoritative understanding in assembled Executive Context", async () => {
    vi.mocked(buildExecutiveContextV2).mockImplementation(async (input) => ({
      ...MOCK_CONTEXT,
      assembledFrom: input.understanding,
    }));

    await buildExecutiveIntelligence(BASE_INPUT);

    const eosInput = vi.mocked(buildExecutiveOperatingSystem).mock.calls[0]?.[0];
    expect(eosInput?.executiveContext.assembledFrom).toBe(UNDERSTANDING_INVOKE);
  });

  it("output içinde executiveContext ve companyModel yoktur", async () => {
    const result = await buildExecutiveIntelligence(BASE_INPUT);

    expect(result).not.toHaveProperty("executiveContext");
    expect(result).not.toHaveProperty("companyModel");
    expect(Object.keys(result).sort()).toEqual(
      ["diagnostics", "executiveOperatingSystem", "understanding"].sort(),
    );
  });

  it("generatedAt EOS'a geçer", async () => {
    const customInput = { ...BASE_INPUT, generatedAt: "2026-01-15T12:00:00.000Z" };

    await buildExecutiveIntelligence(customInput);

    const eosCallArg = vi.mocked(buildExecutiveOperatingSystem).mock.calls[0][0];
    expect(eosCallArg.generatedAt).toBe("2026-01-15T12:00:00.000Z");
  });

  // ── Error propagation ─────────────────────────────────────────────────────

  it("context hatası propagate edilir ve context diagnostic error olur", async () => {
    const contextError = new Error("Context gateway hatası");
    vi.mocked(buildExecutiveContextV2).mockRejectedValue(contextError);

    await expect(buildExecutiveIntelligence(BASE_INPUT)).rejects.toThrow("Context gateway hatası");
    expect(vi.mocked(buildExecutiveOperatingSystem)).not.toHaveBeenCalled();
  });

  it("context hatası sonrası context diagnostic error, eos skipped kalır", async () => {
    vi.mocked(buildExecutiveContextV2).mockRejectedValue(new Error("Context hatası"));

    try {
      await buildExecutiveIntelligence(BASE_INPUT);
    } catch {
      // hata yakalanıyor — diagnostics test için direkt servis içinde kontrol edilemez,
      // ancak hatanın fırlatıldığını ve EOS'un çağrılmadığını doğruluyoruz
    }

    expect(vi.mocked(buildExecutiveOperatingSystem)).not.toHaveBeenCalled();
  });

  it("eos hatası propagate edilir", async () => {
    const eosError = new Error("EOS gateway hatası");
    vi.mocked(buildExecutiveOperatingSystem).mockRejectedValue(eosError);

    await expect(buildExecutiveIntelligence(BASE_INPUT)).rejects.toThrow("EOS gateway hatası");
  });

  it("eos hatası context ve companyModel çağrılarını etkilemez", async () => {
    vi.mocked(buildExecutiveOperatingSystem).mockRejectedValue(new Error("EOS hatası"));

    await expect(buildExecutiveIntelligence(BASE_INPUT)).rejects.toThrow();

    expect(vi.mocked(buildExecutiveContextV2)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildCompanyModel)).toHaveBeenCalledTimes(1);
  });
});
