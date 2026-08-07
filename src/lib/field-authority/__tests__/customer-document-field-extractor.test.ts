import { describe, expect, it, vi } from "vitest";

import { createCustomerDocumentFieldExtractor } from "../customer-document-field-extractor";

describe("customer document field extractor provider contract", () => {
  it("declares extracted values with strict scalar JSON types", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({ candidates: [], unsupportedObservations: [] }),
    });
    const extractor = createCustomerDocumentFieldExtractor({
      client: { responses: { create } } as never,
    });

    await extractor.extract({
      sourceId: "document-1",
      filename: "test.png",
      mediaType: "image/png",
      bytes: new Uint8Array([1]),
      safeFields: [],
    });

    const request = create.mock.calls[0]?.[0] as {
      text: { format: { schema: { properties: { candidates: { items: { properties: { extractedValue: unknown } } } } } } };
    };
    expect(request.text.format.schema.properties.candidates.items.properties.extractedValue)
      .toEqual({ type: ["string", "number", "boolean", "null"] });
  });
});
