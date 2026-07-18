import { describe, expect, it } from "vitest";
import { MemoryItemType } from "@prisma/client";
import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";
import { buildCompanyModel } from "../company-model-builder.service";

describe("Company Model authority projection precedence", () => {
  it("canonical fact deterministically wins over opinion for the same key", () => {
    const fact = evaluateKnowledgeSignal({
      producer: "EXISTING_MEMORY",
      key: "industry",
      value: "Üretim",
      memoryItemType: MemoryItemType.FACT,
      verified: true,
      durable: true,
    });
    const opinion = evaluateKnowledgeSignal({
      producer: "EXECUTIVE_OPINION",
      key: "industry",
      value: "Fintech",
      epistemicType: "OPINION",
      confidence: 0.9,
    });

    const model = buildCompanyModel(null, [
      ...opinion.projections,
      ...fact.projections,
    ]);

    expect(model.industry).toBe("Üretim");
    expect(model.learnedFacts[0]).toMatchObject({
      value: "Üretim",
      epistemicType: "FACT",
      isCanonicalFact: true,
    });
    expect(model.learnedFacts.find((item) => item.value === "Fintech")).toMatchObject({
      source: "opinion",
      epistemicType: "OPINION",
      truthBoundary: "EXECUTIVE_OPINION",
      isCanonicalFact: false,
    });
  });

  it("opinion never becomes a canonical fact when no fact exists", () => {
    const opinion = evaluateKnowledgeSignal({
      producer: "EXECUTIVE_REASONING",
      key: "top_goal",
      value: "Karlılık olmalı",
      epistemicType: "HYPOTHESIS",
    });
    const model = buildCompanyModel(null, opinion.projections);

    expect(model.topGoal).toBe("Karlılık olmalı");
    expect(model.learnedFacts[0]).toMatchObject({
      epistemicType: "HYPOTHESIS",
      isCanonicalFact: false,
    });
  });
});
