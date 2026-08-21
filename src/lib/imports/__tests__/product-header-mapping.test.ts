import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../product-header-mapping";

describe("detectColumnMapping (products)", () => {
  it("maps common Turkish accounting-program headers", () => {
    const { mapping, unmapped } = detectColumnMapping(["Ürün Adı", "Tür", "Kategori", "Birim", "Para Birimi"]);
    expect(mapping["Ürün Adı"]).toBe("name");
    expect(mapping["Tür"]).toBe("type");
    expect(mapping["Kategori"]).toBe("category");
    expect(mapping["Birim"]).toBe("unit");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(unmapped).toEqual([]);
  });

  it("is diacritic and case insensitive", () => {
    expect(detectColumnMapping(["ÜRÜN ADI"]).mapping["ÜRÜN ADI"]).toBe("name");
    expect(detectColumnMapping(["stok adi"]).mapping["stok adi"]).toBe("name");
  });

  it("leaves unrecognized headers unmapped", () => {
    const { mapping, unmapped } = detectColumnMapping(["Notlar", "Barkod"]);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar", "Barkod"]);
  });

  it("claims each field at most once — a later duplicate alias stays unmapped", () => {
    const { mapping } = detectColumnMapping(["Ürün Adı", "Malzeme Adı"]);
    expect(mapping["Ürün Adı"]).toBe("name");
    expect(mapping["Malzeme Adı"]).toBe("unmapped");
  });
});
