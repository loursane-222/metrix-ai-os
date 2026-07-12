import { describe, it, expect } from "vitest";
import { formatExecutiveDecisionEvidence } from "../executive-prompt-bridge-formatter.service";
import { buildExecutiveDecisionPromptSummary } from "@/lib/executive-decision-engine/executive-decision-summary.service";
import type { ExecutiveDecision } from "@/lib/executive-decision-engine/executive-decision-engine.types";

const BASE_DECISION: ExecutiveDecision = {
  id: "test-decision",
  category: "CASH",
  priority: "HIGH",
  title: "Test karari",
  rationale: "Test gerekce",
  firstAction: "Test ilk adim",
  supportingActions: [],
  risks: [],
  opportunities: [],
  impact: 80,
  urgency: 80,
  confidence: "MEDIUM",
  confidenceScore: 65,
  evidenceRefs: [],
  sourceSignals: [],
  evidenceReliability: null,
  followUpWindow: null,
  isFallback: false,
};

describe("formatExecutiveDecisionEvidence", () => {
  it("evidenceRefs + sourceSignals ikisi de varsa: notr varlik satiri + en fazla 2 sinyal ornegi", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["decision:overdue-42"],
      sourceSignals: ["Gecikmis karar takibi", "Acik karar kaydi"],
    });
    expect(result).toContain("- İç dayanak kayıtları mevcut.");
    expect(result).toContain("- Kaynak sinyalleri: Gecikmis karar takibi, Acik karar kaydi");
  });

  it("yalnizca evidenceRefs varsa yalnizca notr varlik bilgisi uretilir", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["decision:overdue-42"],
      sourceSignals: [],
    });
    expect(result).toBe(
      [
        "- İç dayanak kayıtları mevcut.",
        "- Teknik referansları kullanıcıya aktarma. Kaynak sinyalleri yetersiz veya çelişkiliyse kesin bir kanaat sunma; yalnızca gerektiğinde dayanağı, eksikliği veya belirsizliği doğal dille belirt.",
      ].join("\n"),
    );
  });

  it("yalnizca sourceSignals varsa dogru render edilir, varlik satiri gorunmez", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: [],
      sourceSignals: ["Kritik uyari"],
    });
    expect(result).toContain("- Kaynak sinyalleri: Kritik uyari");
    expect(result).not.toContain("İç dayanak kayıtları mevcut.");
  });

  it("ikisi de yoksa bolum hic render edilmez (null doner)", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: [],
      sourceSignals: [],
    });
    expect(result).toBeNull();
  });

  it("decision:* teknik referanslari asla prompt'a sizmaz", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["decision:overdue-42"],
      sourceSignals: [],
    });
    expect(result).not.toContain("decision:overdue-42");
    expect(result).not.toContain("decision:");
  });

  it("failedStep:* teknik referanslari asla prompt'a sizmaz", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["failedStep:paymentContext"],
      sourceSignals: [],
    });
    expect(result).not.toContain("failedStep:paymentContext");
    expect(result).not.toContain("failedStep:");
    expect(result).not.toContain("paymentContext");
  });

  it("ham JSON veya [object Object] asla prompt'a girmez", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["decision:abc123", "failedStep:paymentContext"],
      sourceSignals: ["Kritik uyari", "Eksik veri kaynagi"],
    });
    expect(result).not.toContain("[object Object]");
    expect(result).not.toMatch(/^\s*[[{]/);
    expect(result).not.toContain('"evidenceRefs"');
  });

  it("sourceSignals listesi en fazla 2 ornekle kirpilir", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: [],
      sourceSignals: ["signal-one", "signal-two", "signal-three", "signal-four"],
    });
    const signalLine = result?.split("\n")[0];
    expect(signalLine).toBe("- Kaynak sinyalleri: signal-one, signal-two");
    expect(result).not.toContain("signal-three");
    expect(result).not.toContain("signal-four");
  });

  it("buildExecutiveDecisionPromptSummary evidenceRefs/sourceSignals'i kaybetmeden tasir", () => {
    const decision: ExecutiveDecision = {
      ...BASE_DECISION,
      evidenceRefs: ["decision:xyz"],
      sourceSignals: ["Acik karar kaydi"],
    };
    const summary = buildExecutiveDecisionPromptSummary(decision);
    expect(summary.evidenceRefs).toEqual(["decision:xyz"]);
    expect(summary.sourceSignals).toEqual(["Acik karar kaydi"]);
    // Mevcut confidence/priority ozeti degismedi
    expect(summary.confidence).toBe("MEDIUM");
    expect(summary.priority).toBe("HIGH");
  });

  it("buildExecutiveDecisionPromptSummary evidenceReliability'i kaybetmeden tasir", () => {
    const decision: ExecutiveDecision = {
      ...BASE_DECISION,
      evidenceReliability: { status: "DEGRADED", failedSteps: ["paymentContext"] },
    };
    const summary = buildExecutiveDecisionPromptSummary(decision);
    expect(summary.evidenceReliability).toEqual({
      status: "DEGRADED",
      failedSteps: ["paymentContext"],
    });
  });

  it("evidenceReliability DEGRADED oldugunda belirsizlik talimati uretilir", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: [],
      sourceSignals: ["Kritik uyari"],
      evidenceReliability: { status: "DEGRADED", failedSteps: ["paymentContext"] },
    });
    expect(result).toContain(
      "- Bu kararın dayandığı verinin bir kısmı şu an alınamadı veya güvenilirliği düştü.",
    );
    expect(result).toContain("- Kesin hüküm verme; belirsizliği kullanıcıya doğal dille belirt.");
  });

  it("evidenceReliability yoksa yeni belirsizlik talimati uretilmez, mevcut cikti bozulmaz", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: ["decision:overdue-42"],
      sourceSignals: [],
    });
    expect(result).toBe(
      [
        "- İç dayanak kayıtları mevcut.",
        "- Teknik referansları kullanıcıya aktarma. Kaynak sinyalleri yetersiz veya çelişkiliyse kesin bir kanaat sunma; yalnızca gerektiğinde dayanağı, eksikliği veya belirsizliği doğal dille belirt.",
      ].join("\n"),
    );
    expect(result).not.toContain("güvenilirliği düştü");
  });

  it("evidenceReliability'in ham failedSteps adi kullaniciya sizmaz", () => {
    const result = formatExecutiveDecisionEvidence({
      evidenceRefs: [],
      sourceSignals: ["Kritik uyari"],
      evidenceReliability: { status: "DEGRADED", failedSteps: ["paymentContext"] },
    });
    expect(result).not.toContain("paymentContext");
  });
});
