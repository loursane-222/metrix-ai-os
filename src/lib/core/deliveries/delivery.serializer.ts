import type { DeliveryResult } from "./delivery.types";

function bi(v: bigint): string { return v.toString(); }
function biOpt(v: bigint | null | undefined): string | null {
  return v == null ? null : v.toString();
}

type SerializedOrderItem = Omit<
  NonNullable<DeliveryResult["items"][number]["orderItem"]>,
  "unitPriceCents" | "lineTotalCents"
> & { unitPriceCents: string; lineTotalCents: string };

type SerializedProductService = Omit<
  NonNullable<DeliveryResult["items"][number]["productService"]>,
  "costCents" | "priceCents"
> & { costCents: string | null; priceCents: string | null };

type SerializedDeliveryItem = Omit<DeliveryResult["items"][number], "orderItem" | "productService"> & {
  orderItem: SerializedOrderItem | null;
  productService: SerializedProductService | null;
};

type SerializedCustomer = Omit<DeliveryResult["customer"], "balanceCents"> & { balanceCents: string };

type SerializedDelivery = Omit<DeliveryResult, "items" | "customer"> & {
  customer: SerializedCustomer;
  items: SerializedDeliveryItem[];
};

export function serializeDelivery(delivery: DeliveryResult | null): SerializedDelivery | null {
  if (!delivery) return null;
  return {
    ...delivery,
    customer: { ...delivery.customer, balanceCents: bi(delivery.customer.balanceCents) },
    items: delivery.items.map((item) => ({
      ...item,
      orderItem: item.orderItem
        ? { ...item.orderItem, unitPriceCents: bi(item.orderItem.unitPriceCents), lineTotalCents: bi(item.orderItem.lineTotalCents) }
        : null,
      productService: item.productService
        ? {
            ...item.productService,
            costCents: biOpt(item.productService.costCents),
            priceCents: biOpt(item.productService.priceCents),
          }
        : null,
    })),
  };
}
