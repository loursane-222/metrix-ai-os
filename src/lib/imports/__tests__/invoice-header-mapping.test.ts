import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../invoice-header-mapping";

describe("detectColumnMapping (invoices)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Müşteri", "Fatura No", "Açıklama", "Tutar", "KDV Oranı", "Para Birimi", "Vade Tarihi"], []);
    expect(mapping["Müşteri"]).toBe("customerRef");
    expect(mapping["Fatura No"]).toBe("invoiceNumber");
    expect(mapping["Açıklama"]).toBe("title");
    expect(mapping["Tutar"]).toBe("amount");
    expect(mapping["KDV Oranı"]).toBe("taxRate");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(mapping["Vade Tarihi"]).toBe("dueDate");
    expect(unmapped).toEqual([]);
  });

  it("is diacritic and case insensitive", async () => {
    expect((await detectColumnMapping(["MÜŞTERİ"], [])).mapping["MÜŞTERİ"]).toBe("customerRef");
    expect((await detectColumnMapping(["fatura no"], [])).mapping["fatura no"]).toBe("invoiceNumber");
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar", "Proje"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar", "Proje"]);
  });
});
