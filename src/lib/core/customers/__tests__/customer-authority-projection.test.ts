import { describe, expect, it } from "vitest";
import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";

describe("customer note -> knowledge projection", () => {
  it("produces a COMPANY_MODEL projection from a user-confirmed customer note", () => {
    const decision = evaluateKnowledgeSignal({
      producer: "USER_STATEMENT",
      key: "customer_note:test-customer",
      value: "Test Musteri: finans direktoru gorusmeye dahil edilmeli",
      epistemicType: "FACT",
      verified: false,
      userConfirmed: true,
      durable: true,
      metadata: { sourceRef: "Customer:test-customer" },
    });
    expect(decision.canonicalOwner).toBe("MEMORY_ITEM");
    expect(decision.projections.some((projection) => projection.target === "COMPANY_MODEL")).toBe(true);
  });
});
