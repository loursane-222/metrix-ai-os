import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createDocumentClassifier } from "../document-classifier";

function clientReturning(outputText: string): Pick<OpenAI, "responses"> {
  return { responses: { create: vi.fn().mockResolvedValue({ output_text: outputText }) } } as unknown as Pick<OpenAI, "responses">;
}

describe("document-classifier — fail-closed classification", () => {
  it("returns the model's domain when confidence clears the floor", async () => {
    const classifier = createDocumentClassifier({ client: clientReturning(JSON.stringify({ domain: "SALES_INVOICE", confidence: 0.9, evidence: "Fatura başlığı görünüyor" })) });
    const result = await classifier.classify({ sourceId: "s1", filename: "f.pdf", mediaType: "application/pdf", bytes: new Uint8Array([1]) });
    expect(result).toEqual({ domain: "SALES_INVOICE", confidence: 0.9, evidence: "Fatura başlığı görünüyor", needsReview: false });
  });

  it("forces UNKNOWN + needsReview when confidence is below the floor, even if the model named a domain", async () => {
    const classifier = createDocumentClassifier({ client: clientReturning(JSON.stringify({ domain: "PURCHASE_INVOICE", confidence: 0.3, evidence: "belirsiz" })) });
    const result = await classifier.classify({ sourceId: "s1", filename: "f.pdf", mediaType: "application/pdf", bytes: new Uint8Array([1]) });
    expect(result.domain).toBe("UNKNOWN");
    expect(result.needsReview).toBe(true);
  });

  it("forces UNKNOWN when the model returns a domain label outside the fixed set", async () => {
    const classifier = createDocumentClassifier({ client: clientReturning(JSON.stringify({ domain: "SOMETHING_ELSE", confidence: 0.95, evidence: "x" })) });
    const result = await classifier.classify({ sourceId: "s1", filename: "f.pdf", mediaType: "application/pdf", bytes: new Uint8Array([1]) });
    expect(result.domain).toBe("UNKNOWN");
  });

  it("throws DOCUMENT_PROVIDER_INVALID_OUTPUT on malformed/non-JSON model output instead of guessing a domain", async () => {
    const classifier = createDocumentClassifier({ client: clientReturning("not json at all { ") });
    await expect(classifier.classify({ sourceId: "s1", filename: "f.pdf", mediaType: "application/pdf", bytes: new Uint8Array([1]) })).rejects.toThrow("DOCUMENT_PROVIDER_INVALID_OUTPUT");
  });

  it("throws DOCUMENT_PROVIDER_INVALID_OUTPUT on an empty response", async () => {
    const classifier = createDocumentClassifier({ client: clientReturning("") });
    await expect(classifier.classify({ sourceId: "s1", filename: "f.pdf", mediaType: "application/pdf", bytes: new Uint8Array([1]) })).rejects.toThrow("DOCUMENT_PROVIDER_INVALID_OUTPUT");
  });
});
