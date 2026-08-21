import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../customer-header-mapping";

describe("detectColumnMapping", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Ünvan", "Vergi No", "Vergi Dairesi", "Telefon", "E-posta", "Adres", "Cari Kod"], []);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Vergi No"]).toBe("taxNumber");
    expect(mapping["Vergi Dairesi"]).toBe("taxOffice");
    expect(mapping["Telefon"]).toBe("phone");
    expect(mapping["E-posta"]).toBe("email");
    expect(mapping["Adres"]).toBe("billingAddress");
    expect(mapping["Cari Kod"]).toBe("cariKodu");
    expect(unmapped).toEqual([]);
  });

  it("is diacritic and case insensitive", async () => {
    expect((await detectColumnMapping(["MÜŞTERİ ADI"], [])).mapping["MÜŞTERİ ADI"]).toBe("displayName");
    expect((await detectColumnMapping(["musteri"], [])).mapping["musteri"]).toBe("displayName");
    expect((await detectColumnMapping(["carİ Kod"], [])).mapping["carİ Kod"]).toBe("cariKodu");
  });

  // Live production repro: real exports rarely use the canonical alias
  // verbatim — a combined or extended header should still match by
  // substring instead of needing yet another exact alias added forever.
  it("matches a longer alias as a substring of a combined header", async () => {
    expect((await detectColumnMapping(["İsim/Ünvan"], [])).mapping["İsim/Ünvan"]).toBe("displayName");
    expect((await detectColumnMapping(["Firma İsmi"], [])).mapping["Firma İsmi"]).toBe("displayName");
  });

  // Live production repro: "isim" (name) as a fuzzy alias matched inside
  // "iletişim" (contact/communication) — an unrelated, extremely common
  // header word that happens to contain it — and a phone-number column
  // got claimed as the customer's name before the AI fallback's own
  // value-shape safety check ever ran.
  it("does not fuzzy-match an alias that's coincidentally embedded in an unrelated word", async () => {
    const { mapping } = await detectColumnMapping(["İletişim Numarası"], []);
    expect(mapping["İletişim Numarası"]).toBe("unmapped");
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar", "Segment"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar", "Segment"]);
  });

  it("claims each field at most once — a later duplicate alias stays unmapped", async () => {
    const { mapping } = await detectColumnMapping(["Ünvan", "Firma Adı"], []);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Firma Adı"]).toBe("unmapped");
  });
});
