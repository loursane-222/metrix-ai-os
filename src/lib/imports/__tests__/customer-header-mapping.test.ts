import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../customer-header-mapping";

describe("detectColumnMapping", () => {
  it("maps common Turkish accounting-program headers", () => {
    const { mapping, unmapped } = detectColumnMapping(["Ünvan", "Vergi No", "Vergi Dairesi", "Telefon", "E-posta", "Adres", "Cari Kod"]);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Vergi No"]).toBe("taxNumber");
    expect(mapping["Vergi Dairesi"]).toBe("taxOffice");
    expect(mapping["Telefon"]).toBe("phone");
    expect(mapping["E-posta"]).toBe("email");
    expect(mapping["Adres"]).toBe("billingAddress");
    expect(mapping["Cari Kod"]).toBe("cariKodu");
    expect(unmapped).toEqual([]);
  });

  it("is diacritic and case insensitive", () => {
    expect(detectColumnMapping(["MÜŞTERİ ADI"]).mapping["MÜŞTERİ ADI"]).toBe("displayName");
    expect(detectColumnMapping(["musteri"]).mapping["musteri"]).toBe("displayName");
    expect(detectColumnMapping(["carİ Kod"]).mapping["carİ Kod"]).toBe("cariKodu");
  });

  it("leaves unrecognized headers unmapped", () => {
    const { mapping, unmapped } = detectColumnMapping(["Notlar", "Segment"]);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar", "Segment"]);
  });

  it("claims each field at most once — a later duplicate alias stays unmapped", () => {
    const { mapping } = detectColumnMapping(["Ünvan", "Firma Adı"]);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Firma Adı"]).toBe("unmapped");
  });
});
