import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../production-header-mapping";

describe("detectColumnMapping (production)", () => {
  it("maps common Turkish accounting-program headers", () => {
    const { mapping, unmapped } = detectColumnMapping(["Emir No", "Ürün Adı", "Planlanan Miktar", "Not"]);
    expect(mapping["Emir No"]).toBe("orderNumber");
    expect(mapping["Ürün Adı"]).toBe("productRef");
    expect(mapping["Planlanan Miktar"]).toBe("quantityPlanned");
    expect(mapping["Not"]).toBe("notes");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", () => {
    const { mapping, unmapped } = detectColumnMapping(["Barkod"]);
    expect(mapping["Barkod"]).toBe("unmapped");
    expect(unmapped).toEqual(["Barkod"]);
  });
});
