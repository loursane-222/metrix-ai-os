import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../offer-header-mapping";

describe("detectColumnMapping (offers)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Müşteri", "Açıklama", "Tutar", "Para Birimi"], []);
    expect(mapping["Müşteri"]).toBe("customerRef");
    expect(mapping["Açıklama"]).toBe("title");
    expect(mapping["Tutar"]).toBe("amount");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar"]);
  });
});
