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
  fulfillmentSummary: string;
  reservationStatus: string;
  priorityLabel: string;
  priorityExplanation: string;
  deliveryProgressSummary: string;
  revisionHistorySummary: string;
};

function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function nested(value: unknown, key: string): Record<string, unknown> | null { return object(object(value)?.[key]); }
function revisionValues(value: unknown): string {
  const data = object(value);
  if (!data) return "belirtilmemiş";
  const items = Array.isArray(data.items) ? data.items.filter(object) : [];
  const quantities = items.map((item) => `${String(item?.name ?? "Kalem")}: ${String(item?.quantity ?? "—")}`).join(", ");
  return [data.deadlineAt ? `tarih ${String(data.deadlineAt).slice(0, 10)}` : null, quantities || null].filter(Boolean).join("; ") || "belirtilmemiş";
}

export function serializeOrder(order: OrderResult | null): SerializedOrder | null {
  if (!order) return null;
  const fulfillment = nested(order.executiveSummary, "fulfillment");
  const reservation = nested(order.executiveSummary, "reservation");
  const priority = nested(order.executiveSummary, "priority");
  const delivery = nested(order.executiveSummary, "delivery");
  const revisionHistorySummary = order.revisions.length
    ? order.revisions.map((revision) => `Revizyon ${revision.revisionNumber}: ${revision.changeType} — Önce: ${revisionValues(revision.beforeSnapshot)} — Sonra: ${revisionValues(revision.afterSnapshot)}${revision.reason ? ` — ${revision.reason}` : ""}`).join(" · ")
    : "Henüz revizyon yok";
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
    fulfillmentSummary: String(fulfillment?.fulfillmentSummary ?? "INSUFFICIENT_CANONICAL_DATA"),
    reservationStatus: String(reservation?.reservationStatus ?? "Rezervasyon bekliyor"),
    priorityLabel: String(priority?.priorityLabel ?? "Belirsiz"),
    priorityExplanation: String(priority?.priorityExplanation ?? "INSUFFICIENT_CANONICAL_DATA"),
    deliveryProgressSummary: String(delivery?.deliveryProgressSummary ?? "INSUFFICIENT_CANONICAL_DATA"),
    revisionHistorySummary,
  };
}
