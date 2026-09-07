import { describe, expect, it } from "vitest";
import { ProgressiveDelivery, completedEvidenceReference, type ProgressiveChunk } from "../progressive-delivery";
const envelope = { status: "RESOLVED", data: { amount: 42 }, source: "canonical", factScope: "company.cash", observedAt: "2026-09-07" };
function setup() {
  const evidence = new Map();
  const chunks: { text: string; chunk: ProgressiveChunk }[] = [];
  const delivery = new ProgressiveDelivery(evidence, (text, chunk) => chunks.push({ text, chunk }));
  return { evidence, chunks, delivery };
}
describe("progressive evidence delivery", () => {
  it("does not deliver a finding before completed authoritative evidence", () => {
    const { delivery, chunks, evidence } = setup();
    delivery.push("[[finding:cash]]Unverified.");
    expect(chunks).toEqual([]);
    evidence.set("cash", completedEvidenceReference("cash", envelope));
    delivery.push("Still in rejected section.");
    expect(chunks).toEqual([]);
    delivery.push("[[finding:cash]]Verified.");
    expect(delivery.text).toBe("Verified.");
    expect(chunks[0].chunk.evidenceReferences[0].source).toBe("canonical");
  });
  it("does not equate a completed tool or an unresolved envelope with a fact", () => {
    for (const status of ["ok", "ACCEPTED", "COMPLETED"]) {
      expect(completedEvidenceReference("cash", { ...envelope, status })).toBeNull();
    }
    expect(completedEvidenceReference("cash", { status: "RESOLVED" })).toBeNull();
    expect(completedEvidenceReference("cash", JSON.stringify(envelope))).toEqual({ toolName: "cash", source: "canonical", factScope: "company.cash", observedAt: "2026-09-07", status: "RESOLVED" });
  });
  it("attaches the completed canonical context without asking the model to regenerate tool identifiers", () => {
    const { delivery, evidence, chunks } = setup();
    delivery.push("[[finding]]No evidence yet.");
    expect(delivery.text).toBe("");
    evidence.set("cash", completedEvidenceReference("cash", envelope));
    delivery.push("[[finding]]A real finding.");
    expect(delivery.text).toBe("A real finding.");
    expect(chunks[0].chunk.evidenceReferences).toEqual([evidence.get("cash")]);
  });
  it("preserves unresolved evidence status so availability observations are never labelled resolved facts", () => {
    const ref = completedEvidenceReference("cash", { ...envelope, status: "SOURCE_UNAVAILABLE", data: null });
    expect(ref?.status).toBe("SOURCE_UNAVAILABLE");
    expect(completedEvidenceReference("cash", { ...envelope, status: "RESOLVED", data: null })).toBeNull();
  });
  it("references the existing canonical read/query contracts without requiring a new truth envelope", () => {
    expect(completedEvidenceReference("company_read", { status: "READ_COMPLETED", data: { id: "real" } })?.source).toBe("canonical-operation");
    expect(completedEvidenceReference("company_read", { status: "FAILED", data: null })).toBeNull();
    expect(completedEvidenceReference("company_query", { result: { scope: "single_customer", customer: { id: "real" } } })?.source).toBe("company-query-authority");
    expect(completedEvidenceReference("company_query", { result: { scope: "customer_ambiguous" } })?.status).toBe("CONFLICT");
  });
  it("cannot publish mutation success through the intermediate evidence lane, even when execution is RESOLVED", () => {
    for (const name of ["company_write", "execute_business_action"]) {
      for (const status of ["UNAVAILABLE", "MISMATCH", "PASSED"]) {
        expect(completedEvidenceReference(name, { ...envelope, data: { readback: { status } } })).toBeNull();
      }
    }
  });
  it("requires every source before relating evidence", () => {
    const { delivery, evidence } = setup();
    evidence.set("cash", completedEvidenceReference("cash", envelope));
    delivery.push("[[connection:cash,orders]]Unsupported connection.");
    expect(delivery.text).toBe("");
    evidence.set("orders", completedEvidenceReference("orders", envelope));
    delivery.push("[[connection:cash,orders]]Supported connection.");
    expect(delivery.text).toBe("Supported connection.");
  });
  it("delivers split model frames without speaking framing; preserves final cognition and intermediate prose exactly once", () => {
    const { delivery, chunks, evidence } = setup();
    evidence.set("cash", completedEvidenceReference("cash", envelope));
    const text = "[[finding:cash]]First finding.\n\n[[judgment]]The full executive judgment.\n\n[[synthesis]]The final action.";
    for (const char of text) delivery.push(char);
    delivery.finish();
    expect(delivery.text).toBe("First finding.\n\nThe full executive judgment.\n\nThe final action.");
    expect(chunks.map((c) => c.text).join("")).toBe(delivery.text);
    expect(chunks.some((c) => c.chunk.stage === "judgment")).toBe(true);
  });
  it("preserves ordinary unframed final answers and drops incomplete control frames", () => {
    const { delivery } = setup();
    delivery.push("Ordinary answer. [[judg");
    delivery.finish();
    expect(delivery.text).toBe("Ordinary answer. ");
  });
});
