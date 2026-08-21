import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../stock-header-mapping";

describe("detectColumnMapping (stock)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Ürün Adı", "Depo", "Miktar", "Lot", "Konum"], []);
    expect(mapping["Ürün Adı"]).toBe("productRef");
    expect(mapping["Depo"]).toBe("warehouseRef");
    expect(mapping["Miktar"]).toBe("quantity");
    expect(mapping["Lot"]).toBe("lot");
    expect(mapping["Konum"]).toBe("location");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Notlar"], []);
    expect(mapping["Notlar"]).toBe("unmapped");
    expect(unmapped).toEqual(["Notlar"]);
  });
});
