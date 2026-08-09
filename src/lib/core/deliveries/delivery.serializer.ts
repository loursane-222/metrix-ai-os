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
  integritySummary: string;
  onTimeDeliveryRate: string | null;
  firstAttemptSuccessRate: string | null;
  damageRate: string | null;
};

function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function nested(value: unknown, key: string): Record<string, unknown> | null { return object(object(value)?.[key]); }

export function serializeDelivery(delivery: DeliveryResult | null): SerializedDelivery | null {
  if (!delivery) return null;
  const integrity = nested(delivery.executiveSummary, "integrity");
  const performance = nested(delivery.executiveSummary, "performance");
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
    integritySummary: String(integrity?.integritySummary ?? "INSUFFICIENT_CANONICAL_DATA"),
    onTimeDeliveryRate: typeof performance?.onTimeDeliveryRate === "string" ? performance.onTimeDeliveryRate : null,
    firstAttemptSuccessRate: typeof performance?.firstAttemptSuccessRate === "string" ? performance.firstAttemptSuccessRate : null,
    damageRate: typeof performance?.damageRate === "string" ? performance.damageRate : null,
  };
}
