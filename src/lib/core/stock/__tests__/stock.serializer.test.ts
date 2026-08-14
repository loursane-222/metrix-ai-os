import { describe, expect, it } from "vitest";
import { serializeStock } from "../stock.serializer";
import type { StockResult } from "../stock.types";

describe("serializeStock", () => {
  it("serializes movement unit costs without leaking BigInt into the API response", () => {
    const stock = {
      quantity: 5,
      reservedQuantity: 0,
      productService: { name: "Çelik", costCents: BigInt(100), priceCents: BigInt(200) },
      warehouse: { name: "Ana Depo" },
      movements: [{ unitCostCents: BigInt(12550) }],
    } as unknown as StockResult;

    const serialized = serializeStock(stock);

    expect(serialized?.movements[0]?.unitCostCents).toBe("12550");
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});
