import { describe, expect, it } from "vitest";
import { MemoryItemSource, MemoryItemType } from "@prisma/client";

import { evaluateKnowledgeSignal } from "../executive-knowledge-authority.service";

describe("Executive Knowledge Authority", () => {
  it("explicit user statement becomes the only MemoryItem owner", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "USER_STATEMENT",
      key: "team_size",
      value: "12 kişi",
      memoryItemType: MemoryItemType.FACT,
      memorySource: MemoryItemSource.USER_PROVIDED,
      userConfirmed: true,
      durable: true,
    });

    expect(decision.canonicalOwner).toBe("MEMORY_ITEM");
    expect(decision.truthBoundary).toBe("USER_CONFIRMED");
    expect(decision.promotionPolicy).toBe("AUTOMATIC");
    expect(decision.projections.every((projection) => projection.owner === "MEMORY_ITEM")).toBe(true);
  });

  it("EOS learning can only enter human-approved candidate lifecycle", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "EOS_LEARNING",
      key: "cash_risk",
      value: "Tahsilat döngüsü uzuyor olabilir",
      epistemicType: "INFERENCE",
      isAssumption: true,
      durable: true,
    });

    expect(decision.canonicalOwner).toBe("MEMORY_CANDIDATE");
    expect(decision.promotionPolicy).toBe("HUMAN_APPROVAL");
    expect(decision.projections).toEqual([]);
  });

  it("executive reasoning creates a non-promotable Company Opinion", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "EXECUTIVE_REASONING",
      key: "growth_risk",
      value: "Tek kanala bağımlılık büyümeyi sınırlıyor",
      epistemicType: "OPINION",
      confidence: 0.7,
    });

    expect(decision.canonicalOwner).toBe("COMPANY_OPINION");
    expect(decision.truthBoundary).toBe("EXECUTIVE_OPINION");
    expect(decision.promotionPolicy).toBe("NONE");
    expect(decision.companyOpinion?.promotableToMemory).toBe(false);
  });

  it("mind hypotheses stay conversation-owned projections", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "MIND_STATE",
      key: "objection-price",
      value: "Kullanıcı fiyat çekincesi taşıyor olabilir",
      epistemicType: "HYPOTHESIS",
      conversationScoped: true,
      durable: false,
    });

    expect(decision.canonicalOwner).toBe("CONVERSATION_STATE");
    expect(decision.truthBoundary).toBe("CONVERSATION_ONLY");
    expect(decision.promotionPolicy).toBe("NONE");
    expect(decision.projections.map((projection) => projection.target)).toContain("MIND_STATE");
  });

  it("verified decision outcome preserves Decision Record ownership", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "DECISION_OUTCOME",
      key: "decision_outcome:d1",
      value: "SUCCESS",
      verified: true,
      durable: true,
    });

    expect(decision.canonicalOwner).toBe("DECISION_RECORD");
    expect(decision.truthBoundary).toBe("VERIFIED");
    expect(decision.projections.some((projection) => projection.target === "MIND_STATE")).toBe(true);
    expect(decision.projections.some((projection) => projection.target === "COMPANY_MODEL")).toBe(false);
  });

  it("unverified recognition never auto-promotes", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "RECOGNITION_RESULT",
      key: "main_bottleneck",
      value: "Satış süreci",
      memoryItemType: MemoryItemType.PROCESS,
      memorySource: MemoryItemSource.SYSTEM_INFERRED,
      isAssumption: true,
      durable: true,
    });

    expect(decision.canonicalOwner).toBe("MEMORY_CANDIDATE");
    expect(decision.promotionPolicy).toBe("HUMAN_APPROVAL");
  });
});
