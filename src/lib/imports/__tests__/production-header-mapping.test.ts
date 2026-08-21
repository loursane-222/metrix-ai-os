import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../production-header-mapping";

describe("detectColumnMapping (production)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Emir No", "Ürün Adı", "Planlanan Miktar", "Not"], []);
    expect(mapping["Emir No"]).toBe("orderNumber");
    expect(mapping["Ürün Adı"]).toBe("productRef");
    expect(mapping["Planlanan Miktar"]).toBe("quantityPlanned");
    expect(mapping["Not"]).toBe("notes");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Barkod"], []);
    expect(mapping["Barkod"]).toBe("unmapped");
    expect(unmapped).toEqual(["Barkod"]);
  });
});
