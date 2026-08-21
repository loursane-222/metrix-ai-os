import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../payment-header-mapping";

describe("detectColumnMapping (payments)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Müşteri", "Açıklama", "Tutar", "Para Birimi", "Vade Tarihi"], []);
    expect(mapping["Müşteri"]).toBe("customerRef");
    expect(mapping["Açıklama"]).toBe("title");
    expect(mapping["Tutar"]).toBe("amount");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(mapping["Vade Tarihi"]).toBe("dueDate");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar"]);
  });
});
