import type { OrderResult } from "./order.types";

function bi(v: bigint): string { return v.toString(); }
function biOpt(v: bigint | null | undefined): string | null {
  return v == null ? null : v.toString();
}

type SerializedCustomer = Omit<OrderResult["customer"], "balanceCents"> & { balanceCents: string };

type SerializedProductService = Omit<
  NonNullable<OrderResult["items"][number]["productService"]>,
  "costCents" | "priceCents"
> & { costCents: string | null; priceCents: string | null };

type SerializedOrderItem = Omit<OrderResult["items"][number], "unitPriceCents" | "lineTotalCents" | "productService"> & {
  unitPriceCents: string;
  lineTotalCents: string;
  productService: SerializedProductService | null;
};

type SerializedOrder = Omit<OrderResult, "items" | "customer"> & {
  customer: SerializedCustomer;
  items: SerializedOrderItem[];
};

export function serializeOrder(order: OrderResult | null): SerializedOrder | null {
  if (!order) return null;
  return {
    ...order,
    customer: { ...order.customer, balanceCents: bi(order.customer.balanceCents) },
    items: order.items.map((item) => ({
      ...item,
      unitPriceCents: bi(item.unitPriceCents),
      lineTotalCents: bi(item.lineTotalCents),
      productService: item.productService
        ? { ...item.productService, costCents: biOpt(item.productService.costCents), priceCents: biOpt(item.productService.priceCents) }
        : null,
    })),
  };
}
