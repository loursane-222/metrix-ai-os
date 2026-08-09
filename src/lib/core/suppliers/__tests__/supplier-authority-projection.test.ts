import { describe, expect, it } from "vitest";
import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";

describe("supplier risk note -> knowledge projection", () => {
  it("produces a COMPANY_MODEL projection from a real risk note signal", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "USER_STATEMENT",
      key: "supplier_risk_note:test-supplier",
      value: "Test Tedarikci: kur riski yuksek",
      epistemicType: "FACT",
      verified: false,
      userConfirmed: true,
      durable: true,
      metadata: { sourceRef: "Supplier:test-supplier" },
    });
    expect(decision.canonicalOwner).toBe("MEMORY_ITEM");
    expect(decision.projections.some((projection) => projection.target === "COMPANY_MODEL")).toBe(true);
  });
});
