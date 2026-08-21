import { describe, expect, it } from "vitest";
import { detectColumnMapping } from "../order-header-mapping";

describe("detectColumnMapping (orders)", () => {
  it("maps common Turkish accounting-program headers", () => {
    const { mapping, unmapped } = detectColumnMapping(["Müşteri", "Para Birimi", "Not", "Termin Tarihi"]);
    expect(mapping["Müşteri"]).toBe("customerRef");
    expect(mapping["Para Birimi"]).toBe("currency");
    expect(mapping["Not"]).toBe("notes");
    expect(mapping["Termin Tarihi"]).toBe("deadlineAt");
    expect(unmapped).toEqual([]);
  });

  it("leaves unrecognized headers unmapped", () => {
    const { mapping, unmapped } = detectColumnMapping(["Barkod"]);
    expect(mapping["Barkod"]).toBe("unmapped");
    expect(unmapped).toEqual(["Barkod"]);
  });
});
