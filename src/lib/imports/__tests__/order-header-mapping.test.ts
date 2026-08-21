import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../order-header-mapping";

describe("detectColumnMapping (orders)", () => {
  it("maps common Turkish accounting-program headers", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Müşteri", "Para Birimi", "Not", "Termin Tarihi"], []);
    expect(mapping["Müşteri"]).toBe("customerRef");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(mapping["Not"]).toBe("notes");
    expect(mapping["Termin Tarihi"]).toBe("deadlineAt");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", async () => {
    const { mapping, unmapped } = await detectColumnMapping(["Barkod"], []);
    expect(mapping["Barkod"]).toBe("unmapped");
    expect(unmapped).toEqual(["Barkod"]);
  });
});
