import { describe, it, expect } from "vitest";
import {
  formatExecutiveIntelligenceSignal,
  formatLearningLoop,
  formatExecutiveLearningResolverDecision,
  buildBaseMetrixPrompt,
} from "../prompt-format";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { LearningLoopResult } from "@/lib/learning-loop/learning-loop-orchestrator.types";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEos(confidence: number): ExecutiveOperatingSystem {
  return {
    philosophy: {} as ExecutiveOperatingSystem["philosophy"],
    worldModel: {} as ExecutiveOperatingSystem["worldModel"],
    companyModel: {
      industry: null,
      city: null,
      teamSize: null,
      growthPhase: "unknown",
      topGoal: null,
      cashPriority: null,
      primaryCustomerType: null,
      learnedFacts: [],
      confidence: "none",
    },
    executiveContext: {
      situationSummary: "Nakit akisi kritik seviyeye yaklasti.",
      weight: "critical",
      intentClarity: "clear",
      timeHorizon: "immediate",
      stakeholders: [],
      knowledgeGaps: [],
      canProceed: true,
      proceedRationale: "Yeterli baglam mevcut.",
      assembledFrom: {} as ExecutiveOperatingSystem["executiveContext"]["assembledFrom"],
    },
    reasoning: {
      evidence: [],
      risks: [{ id: "r1", title: "Nakit tukenmesi", explanation: "30 gun", severity: "critical", reversibility: "hard_to_reverse", evidenceIds: [] }],
      priorities: [{ id: "p1", title: "Nakit optimizasyonu", rationale: "En acil konu", impact: "high", evidenceIds: [] }],
      opportunities: [],
      timing: { urgency: "immediate", delayConsequence: "Likidite krizi", optimalActionWindow: "Bugun" },
      organizationalImpact: { scope: "company_wide", affectedAreas: ["finans"], peopleImplications: null },
      tradeOffs: [],
      confidence,
      summary: "Nakit akisi bozulmus, hemen aksiyon gerekiyor.",
    },
    recommendedNextMove: {
      title: "En buyuk alacagi bugün tahsil et",
      rationale: "Likidite riski yuksek, tahsilat gecikmesi kritik",
      expectedImpact: "30 gunluk nakit tamponu olusur",
      confidence: "high",
      timeframe: "immediate",
      alternatives: [],
      missingInformation: [],
      followUpTrigger: "Tahsilat gerceklesirse tekrar degerlendir",
    },
    learningLoop: {
      shouldLearn: false,
      candidates: [],
      blockedReason: "Test",
    },
    generatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function makeEmptyMemoryContext(): MemoryContext {
  return {
    version: "v1",
    generatedAt: "2026-07-02T00:00:00.000Z",
    organizationId: "test-org",
    totalIncluded: 0,
    highlights: [],
    strategic: [],
    facts: [],
    processes: [],
    preferences: [],
    conflicts: [],
  };
}

function makeMinimalPromptInput(): BuildSystemPromptInput {
  return {
    memoryContext: makeEmptyMemoryContext(),
    organizationSummary: "Test sirket.",
    personContext: [],
  };
}

// ─── formatExecutiveIntelligenceSignal ───────────────────────────────────────

describe("formatExecutiveIntelligenceSignal", () => {
  it("null EOS girilince null doner", () => {
    expect(formatExecutiveIntelligenceSignal(null)).toBeNull();
    expect(formatExecutiveIntelligenceSignal(undefined)).toBeNull();
  });

  it("confidence < 0.3 ise null doner", () => {
    expect(formatExecutiveIntelligenceSignal(makeEos(0.29))).toBeNull();
    expect(formatExecutiveIntelligenceSignal(makeEos(0.0))).toBeNull();
  });

  it("confidence >= 0.3 ise sinyal uretir", () => {
    expect(formatExecutiveIntelligenceSignal(makeEos(0.3))).not.toBeNull();
    expect(formatExecutiveIntelligenceSignal(makeEos(0.8))).not.toBeNull();
  });

  it("uretilen sinyal onerilen yonu icerir", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("En buyuk alacagi bugün tahsil et");
  });

  it("pasif arka-plan dili yerine direktif yonetici dili kullanir", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).not.toContain("arka plan olarak degerlendir");
    expect(result).toContain("kanaat");
  });

  it("pasif danismanlik sorularina karsi uyari iceriyor", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("pasif danismanlik dili");
  });

  it("once kanaat direktifi var", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("Once yonetici kanaatini acik ifade et");
  });

  it("teknik metadata yasagi devam ediyor", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("Teknik sistem adi, sinyal kaynagi veya metadata kullaniciya soyleme");
  });

  it("eksik bilgi varsa bile kanaat direktifi var", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("Eksik bilgi olsa bile once mevcut bilgiyle kanaat ver");
  });

  it("en fazla bir soru siniri var", () => {
    const result = formatExecutiveIntelligenceSignal(makeEos(0.7))!;
    expect(result).toContain("en fazla bir soru");
  });
});

// ─── formatLearningLoop ───────────────────────────────────────────────────────

describe("formatLearningLoop", () => {
  const makeLearningLoop = (): LearningLoopResult => ({
    snapshot: {} as LearningLoopResult["snapshot"],
    prompt: null,
    opportunity: {
      key: "team_size",
      priority: "HIGH",
      reason: "Ekip buyuklugu bilinmiyor.",
      suggestedQuestion: "Kac calisan var?",
    },
  });

  it("HIGH priority + suggestedQuestion varsa sonuc doner", () => {
    const result = formatLearningLoop(makeLearningLoop(), null);
    expect(result).not.toBeNull();
  });

  it("once kanaat direktifi var", () => {
    const result = formatLearningLoop(makeLearningLoop(), null)!;
    expect(result).toContain("Once kullanicinin sorusuna kanaat ve aksiyon ver");
  });

  it("soruyu en sona birak mesaji var", () => {
    const result = formatLearningLoop(makeLearningLoop(), null)!;
    expect(result).toContain("ogrenme sorusunu en sona birak");
  });

  it("zorlama yasagi devam ediyor", () => {
    const result = formatLearningLoop(makeLearningLoop(), null)!;
    expect(result).toContain("Zorlama");
  });

  it("null learningLoop girilince null doner", () => {
    expect(formatLearningLoop(null, null)).toBeNull();
  });

  it("LOW priority ise null doner", () => {
    const loop: LearningLoopResult = {
      snapshot: {} as LearningLoopResult["snapshot"],
      prompt: null,
      opportunity: { key: "team_size", priority: "LOW", reason: "Dusuk oncelik.", suggestedQuestion: "Soru?" },
    };
    expect(formatLearningLoop(loop, null)).toBeNull();
  });
});

// ─── formatExecutiveLearningResolverDecision ─────────────────────────────────

describe("formatExecutiveLearningResolverDecision", () => {
  const makeDecision = (): ExecutiveLearningResolverDecision => ({
    generatedAt: "2026-07-02T00:00:00.000Z",
    source: "GOAL",
    shouldAskNow: true,
    finalQuestion: "Aylik ciron nedir?",
    targetKey: "monthly_revenue",
    winningScore: 0.9,
    reason: "Hedef tamamen eksik.",
    candidates: [],
  });

  it("shouldAskNow true ise sonuc doner", () => {
    const result = formatExecutiveLearningResolverDecision(makeDecision(), null);
    expect(result).not.toBeNull();
  });

  it("kanaat-aksiyon once, ogrenme sorusu en sona direktifi var", () => {
    const result = formatExecutiveLearningResolverDecision(makeDecision(), null)!;
    expect(result).toContain("kanaat ver, aksiyon ver");
    expect(result).toContain("en sona birak");
  });

  it("zorlama yasagi devam ediyor", () => {
    const result = formatExecutiveLearningResolverDecision(makeDecision(), null)!;
    expect(result).toContain("zorlamayin");
  });

  it("shouldAskNow false ise null doner", () => {
    const decision: ExecutiveLearningResolverDecision = {
      ...makeDecision(),
      shouldAskNow: false,
    };
    expect(formatExecutiveLearningResolverDecision(decision, null)).toBeNull();
  });
});

// ─── buildBaseMetrixPrompt — anti-consultant language ────────────────────────

describe("buildBaseMetrixPrompt — yasak danismanlik dili", () => {
  it("pasif soru yasagi icerir", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput());
    expect(prompt).toContain("Nasil destek beklersiniz?");
    expect(prompt).toContain("Ne yapmami istersiniz?");
  });

  it("pasif oneri dili yasagi icerir", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput());
    expect(prompt).toContain("Isterseniz...");
    expect(prompt).toContain("Yapabilirsiniz...");
  });

  it("sahiplenme dili ornekleri icerir", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput());
    expect(prompt).toContain("Benim kanaatim...");
    expect(prompt).toContain("Dogru hamle...");
  });

  it("once kanaat-aksiyon, sonra en fazla tek soru direktifi icerir", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput());
    expect(prompt).toContain("once kanaat ver, aksiyon ver, sonra gerekiyorsa en fazla tek soru sor");
  });
});
