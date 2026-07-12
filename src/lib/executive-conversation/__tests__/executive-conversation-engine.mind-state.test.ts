import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  observeExecutiveMindState,
  type MindStateObservationInput,
} from "../executive-conversation-engine.service";
import type { ExecutiveConversationState } from "../executive-conversation.types";
import type { ExecutiveObjectionSignal } from "../executive-recommendation.types";
import type {
  ExecutiveRecommendationPackage,
  ExecutiveMindState,
  ExecutiveMindBelief,
} from "@/lib/ai/executive-conversation.types";

// Fixed "now" so lastReinforcedAt stamps are deterministic across the file.
const NOW = "2026-07-12T00:00:00.000Z";
const MIND_STATE_ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ExecutiveConversationState> = {}): ExecutiveConversationState {
  return {
    phase: "OPEN_ENDED",
    lastRecommendationTitle: null,
    lastRecommendationRationale: null,
    lastObjectionType: null,
    objectionCount: 0,
    clarifyingQuestion: null,
    commitmentRequest: null,
    isRevisionRequired: false,
    committedTitle: null,
    committedAt: null,
    followUpDueAt: null,
    commitmentOutcome: null,
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function makeObjectionSignal(overrides: Partial<ExecutiveObjectionSignal> = {}): ExecutiveObjectionSignal {
  return {
    type: "BUDGET_CONSTRAINT",
    confidence: 0.9,
    rawKeywords: ["butce"],
    ...overrides,
  };
}

function makeRecommendationPackage(
  overrides: Partial<ExecutiveRecommendationPackage> = {},
): ExecutiveRecommendationPackage {
  return {
    primaryAction: "Test aksiyon",
    primaryRationale: "Test gerekce",
    primaryConfidenceLabel: "ORTA",
    primaryEvidence: [],
    alternatives: [],
    objectionType: null,
    objectionResponse: null,
    nextBestAlternative: null,
    revisionTrigger: "test",
    hasEnoughContext: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<MindStateObservationInput> = {}): MindStateObservationInput {
  return {
    state: makeState(),
    conversationSignal: null,
    objectionSignal: null,
    recommendationPackage: null,
    previousMindState: null,
    ...overrides,
  };
}

// ─── attentionFocus oncelik sirasi ───────────────────────────────────────────

describe("observeExecutiveMindState — attentionFocus oncelik sirasi", () => {
  it("objectionSignal varsa attentionFocus objection tipini alir (conversationSignal/recommendation olsa bile)", () => {
    const result = observeExecutiveMindState(
      makeInput({
        state: makeState({ phase: "OBJECTION_HANDLED" }),
        objectionSignal: makeObjectionSignal({ type: "TIME_CONSTRAINT" }),
        conversationSignal: { type: "REJECTION", confidence: 0.8 },
        recommendationPackage: makeRecommendationPackage(),
      }),
    );
    expect(result?.attentionFocus).toBe("TIME_CONSTRAINT");
  });

  it("objectionSignal yoksa, conversationSignal varsa attentionFocus onun tipini alir", () => {
    const result = observeExecutiveMindState(
      makeInput({
        conversationSignal: { type: "UNCERTAINTY", confidence: 0.7 },
        recommendationPackage: makeRecommendationPackage(),
      }),
    );
    expect(result?.attentionFocus).toBe("UNCERTAINTY");
  });

  it("objection/conversationSignal yoksa, recommendationPackage varsa attentionFocus 'RECOMMENDATION' olur", () => {
    const result = observeExecutiveMindState(
      makeInput({ recommendationPackage: makeRecommendationPackage() }),
    );
    expect(result?.attentionFocus).toBe("RECOMMENDATION");
  });

  it("hicbir sinyal yoksa attentionFocus state.phase degerine duser", () => {
    const result = observeExecutiveMindState(
      makeInput({ state: makeState({ phase: "CLARIFYING" }) }),
    );
    expect(result?.attentionFocus).toBe("CLARIFYING");
  });
});

// ─── workingMemory ────────────────────────────────────────────────────────────

describe("observeExecutiveMindState — workingMemory", () => {
  it("her zaman phase alanini icerir", () => {
    const result = observeExecutiveMindState(makeInput({ state: makeState({ phase: "REVISED" }) }));
    expect(result?.workingMemory).toContainEqual({ key: "phase", value: "REVISED" });
  });

  it("lastRecommendationTitle varsa workingMemory'e eklenir", () => {
    const result = observeExecutiveMindState(
      makeInput({ state: makeState({ lastRecommendationTitle: "Nakit tahsilati" }) }),
    );
    expect(result?.workingMemory).toContainEqual({
      key: "lastRecommendationTitle",
      value: "Nakit tahsilati",
    });
  });

  it("lastRecommendationTitle yoksa workingMemory'de o alan gorunmez", () => {
    const result = observeExecutiveMindState(
      makeInput({ state: makeState({ lastRecommendationTitle: null }) }),
    );
    expect(result?.workingMemory?.some((item) => item.key === "lastRecommendationTitle")).toBe(false);
  });
});

// ─── hypotheses / beliefs birlesimi (merge, dedupe, cap) ─────────────────────

describe("observeExecutiveMindState — hypotheses/beliefs evolution", () => {
  it("previousMindState'teki hypotheses, bu turn yeni uretmese bile korunur", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h-old", summary: "Eski hipotez" }],
      beliefs: [],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.hypotheses).toEqual([{ id: "h-old", summary: "Eski hipotez", lastReinforcedAt: NOW }]);
  });

  it("previousMindState'teki beliefs, bu turn yeni uretmese bile korunur", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [{ id: "b-old", summary: "Eski kanaat" }],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.beliefs).toEqual([{ id: "b-old", summary: "Eski kanaat", lastReinforcedAt: NOW }]);
  });

  it("yeni objection hipotezi onceki hipotezlerle birlesir, yeni once gelir", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h-old", summary: "Eski hipotez" }],
      beliefs: [],
    };
    const result = observeExecutiveMindState(
      makeInput({
        objectionSignal: makeObjectionSignal({ type: "TEAM_CONSTRAINT" }),
        previousMindState,
      }),
    );
    expect(result?.hypotheses?.map((h) => h.id)).toEqual(["objection-TEAM_CONSTRAINT", "h-old"]);
  });

  it("ayni id'ye sahip hipotez tekrar eklenmez (duplicate yok)", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "objection-BUDGET_CONSTRAINT", summary: "Onceki turdan ayni hipotez" }],
      beliefs: [],
    };
    const result = observeExecutiveMindState(
      makeInput({
        objectionSignal: makeObjectionSignal({ type: "BUDGET_CONSTRAINT" }),
        previousMindState,
      }),
    );
    const ids = result?.hypotheses?.map((h) => h.id) ?? [];
    expect(ids.filter((id) => id === "objection-BUDGET_CONSTRAINT")).toHaveLength(1);
  });

  it("committedTitle ile COMMITTED faz belief uretir", () => {
    const result = observeExecutiveMindState(
      makeInput({ state: makeState({ phase: "COMMITTED", committedTitle: "Plan A" }) }),
    );
    expect(result?.beliefs).toContainEqual({
      id: "commitment-Plan A",
      summary: 'Kullanıcı "Plan A" kararına bağlandı.',
      lastReinforcedAt: NOW,
    });
  });

  it("hypotheses en fazla 3 kayitla sinirlidir (cap)", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [
        { id: "h1", summary: "Hipotez 1" },
        { id: "h2", summary: "Hipotez 2" },
        { id: "h3", summary: "Hipotez 3" },
      ],
      beliefs: [],
    };
    const result = observeExecutiveMindState(
      makeInput({
        objectionSignal: makeObjectionSignal({ type: "REJECTION" }),
        previousMindState,
      }),
    );
    expect(result?.hypotheses).toHaveLength(3);
    expect(result?.hypotheses?.map((h) => h.id)).toEqual(["objection-REJECTION", "h1", "h2"]);
  });

  it("beliefs en fazla 3 kayitla sinirlidir (cap)", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [
        { id: "b1", summary: "Kanaat 1" },
        { id: "b2", summary: "Kanaat 2" },
        { id: "b3", summary: "Kanaat 3" },
      ] as ExecutiveMindBelief[],
    };
    const result = observeExecutiveMindState(
      makeInput({
        state: makeState({ phase: "COMMITTED", committedTitle: "Plan B" }),
        previousMindState,
      }),
    );
    expect(result?.beliefs).toHaveLength(3);
    expect(result?.beliefs?.map((b) => b.id)).toEqual(["commitment-Plan B", "b1", "b2"]);
  });

  it("hicbir sinyal/previousMindState yoksa bos listeler doner", () => {
    const result = observeExecutiveMindState(makeInput());
    expect(result?.hypotheses).toEqual([]);
    expect(result?.beliefs).toEqual([]);
  });
});

// ─── Executive Momentum — Sonme (Decay) ──────────────────────────────────────

describe("observeExecutiveMindState — hypotheses/beliefs sonme (decay)", () => {
  it("esik altindaki (taze) hipotez aynen korunur, damgasi degismez", () => {
    const belowThreshold = new Date(Date.parse(NOW) - (MIND_STATE_ITEM_MAX_AGE_MS - 1)).toISOString();
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h-fresh", summary: "Taze hipotez", lastReinforcedAt: belowThreshold }],
      beliefs: [],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.hypotheses).toEqual([
      { id: "h-fresh", summary: "Taze hipotez", lastReinforcedAt: belowThreshold },
    ]);
  });

  it("esigi asmis ve reinforce edilmemis hipotez merge sonucundan duser", () => {
    const aboveThreshold = new Date(Date.parse(NOW) - (MIND_STATE_ITEM_MAX_AGE_MS + 1)).toISOString();
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h-stale", summary: "Eskimis hipotez", lastReinforcedAt: aboveThreshold }],
      beliefs: [],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.hypotheses).toEqual([]);
  });

  it("esigi asmis ve reinforce edilmemis kanaat merge sonucundan duser (belief icin ayni davranis)", () => {
    const aboveThreshold = new Date(Date.parse(NOW) - (MIND_STATE_ITEM_MAX_AGE_MS + 1)).toISOString();
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [{ id: "b-stale", summary: "Eskimis kanaat", lastReinforcedAt: aboveThreshold }],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.beliefs).toEqual([]);
  });

  it("ayni id bu turn yeniden uretilirse (reinforce), esigi asmis olsa bile guncelligi yenilenir", () => {
    const wayPastThreshold = new Date(Date.parse(NOW) - MIND_STATE_ITEM_MAX_AGE_MS * 10).toISOString();
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [
        { id: "objection-BUDGET_CONSTRAINT", summary: "Eski ve eskimis ayni hipotez", lastReinforcedAt: wayPastThreshold },
      ],
      beliefs: [],
    };
    const result = observeExecutiveMindState(
      makeInput({
        objectionSignal: makeObjectionSignal({ type: "BUDGET_CONSTRAINT" }),
        previousMindState,
      }),
    );
    expect(result?.hypotheses).toEqual([
      {
        id: "objection-BUDGET_CONSTRAINT",
        summary: "Kullanıcı BUDGET_CONSTRAINT tipinde bir çekince belirtmiş olabilir.",
        lastReinforcedAt: NOW,
      },
    ]);
  });

  it("eski metadatada lastReinforcedAt alani bulunmayan kayit guvenli ele alinir (grandfathered, dusmez)", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h-legacy", summary: "Alan olmadan eski kayit" }],
      beliefs: [{ id: "b-legacy", summary: "Alan olmadan eski kanaat" }],
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.hypotheses).toEqual([{ id: "h-legacy", summary: "Alan olmadan eski kayit", lastReinforcedAt: NOW }]);
    expect(result?.beliefs).toEqual([{ id: "b-legacy", summary: "Alan olmadan eski kanaat", lastReinforcedAt: NOW }]);
  });
});

// ─── Executive Intent Persistence ────────────────────────────────────────────

describe("observeExecutiveMindState — primaryIntent", () => {
  it("hasEnoughContext ile ve onceki intent yokken primaryIntent ilk kez olusur", () => {
    const result = observeExecutiveMindState(
      makeInput({
        recommendationPackage: makeRecommendationPackage({
          primaryAction: "Kuzey Ege'de distributor agi kur",
          primaryConfidenceLabel: "GÜÇLÜ",
        }),
      }),
    );
    expect(result?.primaryIntent).toBe("Kuzey Ege'de distributor agi kur");
    expect(result?.intentConfidence).toBe("GÜÇLÜ");
  });

  it("kucuk konu degisikliginde (objection, NEW_INFORMATION olmadan) primaryIntent korunur", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [],
      primaryIntent: "Kuzey Ege'de distributor agi kur",
      intentConfidence: "GÜÇLÜ",
    };
    const result = observeExecutiveMindState(
      makeInput({
        objectionSignal: makeObjectionSignal({ type: "BUDGET_CONSTRAINT" }),
        recommendationPackage: makeRecommendationPackage({
          primaryAction: "Butce plani hakkinda alternatif aksiyon",
          primaryConfidenceLabel: "TEMKİNLİ",
        }),
        previousMindState,
      }),
    );
    expect(result?.primaryIntent).toBe("Kuzey Ege'de distributor agi kur");
    expect(result?.intentConfidence).toBe("GÜÇLÜ");
  });

  it("hicbir yeni sinyal/oneri olmayan (kucuk sohbet) turda da primaryIntent korunur", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [],
      primaryIntent: "Kuzey Ege'de distributor agi kur",
      intentConfidence: "ORTA",
    };
    const result = observeExecutiveMindState(makeInput({ previousMindState }));
    expect(result?.primaryIntent).toBe("Kuzey Ege'de distributor agi kur");
    expect(result?.intentConfidence).toBe("ORTA");
  });

  it("kullanici NEW_INFORMATION sinyaliyle acikca yeni ana hedef belirtince primaryIntent guncellenir", () => {
    const previousMindState: ExecutiveMindState = {
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [],
      beliefs: [],
      primaryIntent: "Kuzey Ege'de distributor agi kur",
      intentConfidence: "GÜÇLÜ",
    };
    const result = observeExecutiveMindState(
      makeInput({
        conversationSignal: { type: "NEW_INFORMATION", confidence: 0.9 },
        recommendationPackage: makeRecommendationPackage({
          primaryAction: "Guney bolgesinde perakende satisa gec",
          primaryConfidenceLabel: "ORTA",
        }),
        previousMindState,
      }),
    );
    expect(result?.primaryIntent).toBe("Guney bolgesinde perakende satisa gec");
    expect(result?.intentConfidence).toBe("ORTA");
  });

  it("hasEnoughContext false ve onceki intent yoksa primaryIntent null kalir", () => {
    const result = observeExecutiveMindState(
      makeInput({
        recommendationPackage: makeRecommendationPackage({ hasEnoughContext: false }),
      }),
    );
    expect(result?.primaryIntent).toBeNull();
    expect(result?.intentConfidence).toBeNull();
  });
});
