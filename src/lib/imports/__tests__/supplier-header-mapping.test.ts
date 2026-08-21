import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../supplier-header-mapping";

describe("detectColumnMapping (suppliers)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Ünvan", "Telefon", "E-posta", "Vergi No", "Vergi Dairesi"], []);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Telefon"]).toBe("phone");
    expect(mapping["E-posta"]).toBe("email");
    expect(mapping["Vergi No"]).toBe("taxNumber");
    expect(mapping["Vergi Dairesi"]).toBe("taxOffice");
    expect(unmapped).toEqual([]);
  });

  it("is diacritic and case insensitive", async () => {
    expect((await detectColumnMapping(["ÜNVAN"], [])).mapping["ÜNVAN"]).toBe("displayName");
    expect((await detectColumnMapping(["tedarikci adi"], [])).mapping["tedarikci adi"]).toBe("displayName");
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar"]);
  });
});
