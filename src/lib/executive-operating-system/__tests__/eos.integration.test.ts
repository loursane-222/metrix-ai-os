import { vi, describe, it, expect, beforeEach } from "vitest";
import { buildExecutiveOperatingSystem } from "../executive-operating-system.service";
import { EMPTY_COMPANY_MODEL } from "../company-model.types";
import { generateExecutiveReasoningRaw } from "../executive-reasoning.gateway";
import { generateRecommendedNextMoveRaw } from "../recommended-next-move.gateway";
import { generateLearningLoopRaw } from "../learning-loop.gateway";
import type { ExecutiveOperatingSystemInput } from "../executive-operating-system.types";
import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";

// Gateway'leri izole et — gerçek OpenAI çağrısı yapılmasın.
vi.mock("../executive-reasoning.gateway", () => ({
  generateExecutiveReasoningRaw: vi.fn(),
}));
vi.mock("../recommended-next-move.gateway", () => ({
  generateRecommendedNextMoveRaw: vi.fn(),
}));
vi.mock("../learning-loop.gateway", () => ({
  generateLearningLoopRaw: vi.fn(),
}));

// ─── Mock Değerleri ────────────────────────────────────────────────────────────

const MOCK_REASONING_RAW = JSON.stringify({
  evidence: [],
  risks: [],
  priorities: [],
  opportunities: [],
  timing: { urgency: "no_urgency", delayConsequence: null, optimalActionWindow: null },
  organizationalImpact: { scope: "individual", affectedAreas: [], peopleImplications: null },
  tradeOffs: [],
  confidence: 0.5,
  summary: "Test muhakemesi.",
});

const MOCK_NEXT_MOVE_RAW = JSON.stringify({
  title: "Test hareketi",
  rationale: "Test gerekçesi",
  expectedImpact: "Test etkisi",
  confidence: "medium",
  timeframe: "this_week",
  alternatives: [],
  missingInformation: [],
  followUpTrigger: null,
});

const MOCK_LEARNING_LOOP_RAW = JSON.stringify({
  shouldLearn: false,
  candidates: [],
  blockedReason: "Test modunda öğrenme devre dışı.",
});

const MOCK_EXECUTIVE_CONTEXT: ExecutiveContextV2 = {
  situationSummary: "Test durumu.",
  weight: "routine",
  intentClarity: "clear",
  timeHorizon: "near_term",
  stakeholders: [],
  knowledgeGaps: [],
  canProceed: true,
  proceedRationale: "Test için hazır.",
  assembledFrom: {
    conversationKind: "company_related",
    userMotivation: "karar_destegi",
    companyRelevance: "high",
    actionExpectation: "explicit",
    confidence: "high",
    shouldAskClarification: false,
    shouldInvokeExecutiveBrain: true,
    suggestedHandling: "executive_reasoning",
    reasoning: {
      summary: "Test anlayış özeti.",
      observations: [],
      uncertainty: [],
      whyThisHandling: "Test senaryosu.",
    },
  },
};

const MOCK_INPUT: ExecutiveOperatingSystemInput = {
  executiveContext: MOCK_EXECUTIVE_CONTEXT,
  companyModel: EMPTY_COMPANY_MODEL,
  generatedAt: "2026-06-29T00:00:00.000Z",
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("buildExecutiveOperatingSystem — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateExecutiveReasoningRaw).mockResolvedValue(MOCK_REASONING_RAW);
    vi.mocked(generateRecommendedNextMoveRaw).mockResolvedValue(MOCK_NEXT_MOVE_RAW);
    vi.mocked(generateLearningLoopRaw).mockResolvedValue(MOCK_LEARNING_LOOP_RAW);
  });

  it("çıktı ExecutiveOperatingSystem shape'ine uyuyor", async () => {
    const result = await buildExecutiveOperatingSystem(MOCK_INPUT);

    expect(result).toHaveProperty("philosophy");
    expect(result).toHaveProperty("worldModel");
    expect(result).toHaveProperty("companyModel");
    expect(result).toHaveProperty("executiveContext");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("recommendedNextMove");
    expect(result).toHaveProperty("learningLoop");
    expect(result).toHaveProperty("generatedAt", "2026-06-29T00:00:00.000Z");
  });

  it("gateway'ler doğru sırayla çağrılıyor", async () => {
    const callOrder: string[] = [];
    vi.mocked(generateExecutiveReasoningRaw).mockImplementation(async () => {
      callOrder.push("reasoning");
      return MOCK_REASONING_RAW;
    });
    vi.mocked(generateRecommendedNextMoveRaw).mockImplementation(async () => {
      callOrder.push("nextMove");
      return MOCK_NEXT_MOVE_RAW;
    });
    vi.mocked(generateLearningLoopRaw).mockImplementation(async () => {
      callOrder.push("learningLoop");
      return MOCK_LEARNING_LOOP_RAW;
    });

    await buildExecutiveOperatingSystem(MOCK_INPUT);

    expect(callOrder).toEqual(["reasoning", "nextMove", "learningLoop"]);
  });

  it("reasoning çıktısı recommendedNextMove gateway'ine geçiyor", async () => {
    await buildExecutiveOperatingSystem(MOCK_INPUT);

    const [reasoningArg] = vi.mocked(generateRecommendedNextMoveRaw).mock.calls[0];
    expect(reasoningArg).toHaveProperty("summary", "Test muhakemesi.");
  });

  it("reasoning ve nextMove learningLoop gateway'ine geçiyor", async () => {
    await buildExecutiveOperatingSystem(MOCK_INPUT);

    const [reasoningArg, nextMoveArg] = vi.mocked(generateLearningLoopRaw).mock.calls[0];
    expect(reasoningArg).toHaveProperty("summary", "Test muhakemesi.");
    expect(nextMoveArg).toHaveProperty("title", "Test hareketi");
  });

  it("gateway hatası fallback olmadan fırlatılıyor", async () => {
    vi.mocked(generateExecutiveReasoningRaw).mockRejectedValue(
      new Error("OPENAI_API_KEY is not configured.")
    );

    await expect(buildExecutiveOperatingSystem(MOCK_INPUT)).rejects.toThrow(
      "OPENAI_API_KEY is not configured."
    );

    expect(vi.mocked(generateRecommendedNextMoveRaw)).not.toHaveBeenCalled();
    expect(vi.mocked(generateLearningLoopRaw)).not.toHaveBeenCalled();
  });

  it("parser hatası fallback olmadan fırlatılıyor", async () => {
    vi.mocked(generateExecutiveReasoningRaw).mockResolvedValue("geçersiz json{{{");

    await expect(buildExecutiveOperatingSystem(MOCK_INPUT)).rejects.toThrow(
      "ExecutiveReasoning: JSON parse başarısız."
    );
  });
});
