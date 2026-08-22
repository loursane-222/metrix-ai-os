import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../delivery-header-mapping";

describe("detectColumnMapping (deliveries)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(
      ["Sipariş No", "Depo", "Çıkış Noktası", "Teslimat Adresi", "Nakliyeci", "Not"],
      [],
    );
    expect(mapping["Sipariş No"]).toBe("orderNumberRef");
    expect(mapping["Depo"]).toBe("warehouse");
    expect(mapping["Çıkış Noktası"]).toBe("dispatchPoint");
    expect(mapping["Teslimat Adresi"]).toBe("deliveryAddress");
    expect(mapping["Nakliyeci"]).toBe("carrier");
    expect(mapping["Not"]).toBe("notes");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Barkod"], []);
    expect(mapping["Barkod"]).toBe("unmapped");
    expect(unmapped).toEqual(["Barkod"]);
  });
});
