import type { StockResult } from "./stock.types";

type SerializedProductService = Omit<
  NonNullable<StockResult["productService"]>,
  "costCents" | "priceCents"
> & { costCents: string | null; priceCents: string | null };

type SerializedStock = Omit<StockResult, "productService"> & {
  productService: SerializedProductService;
  availableQuantity: string;
  productServiceName: string;
  warehouseName: string;
};

function biOpt(v: bigint | null | undefined): string | null {
  return v == null ? null : v.toString();
}

export function serializeStock(stock: StockResult | null): SerializedStock | null {
  if (!stock) return null;
  const availableQuantity = (Number(stock.quantity) - Number(stock.reservedQuantity)).toFixed(3);
  return {
    ...stock,
    availableQuantity,
    productServiceName: stock.productService.name,
    warehouseName: stock.warehouse.name,
    productService: {
      ...stock.productService,
      costCents: biOpt(stock.productService.costCents),
      priceCents: biOpt(stock.productService.priceCents),
    },
  };
}
