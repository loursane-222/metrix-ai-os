import { describe, expect, it } from "vitest";
import { evaluateKnowledgeSignal } from "../executive-knowledge-authority.service";
import { buildMindStateKnowledgeProjections } from "@/lib/executive-conversation/executive-mind-state-authority.service";

describe("Knowledge projection safety", () => {
  it("opinion and hypothesis retain epistemic identity", () => {
    const opinion = evaluateKnowledgeSignal({
      producer: "EXECUTIVE_OPINION",
      key: "industry",
      value: "Fintech olabilir",
      epistemicType: "OPINION",
    });
    expect(opinion.projections[0]).toMatchObject({
      owner: "COMPANY_OPINION",
      epistemicType: "OPINION",
      truthBoundary: "EXECUTIVE_OPINION",
      readOnly: true,
    });

    const [hypothesis] = buildMindStateKnowledgeProjections({
      attentionFocus: null,
      workingMemory: [],
      hypotheses: [{ id: "h1", summary: "Fiyat çekincesi olabilir" }],
      beliefs: [],
    });
    expect(hypothesis).toMatchObject({
      epistemicType: "HYPOTHESIS",
      truthBoundary: "CONVERSATION_ONLY",
      target: "MIND_STATE",
    });
    expect(hypothesis.target).not.toBe("COMPANY_MODEL");
  });
});
