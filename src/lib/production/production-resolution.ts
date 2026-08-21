import type { ProductionOrderRecord } from "./productions-client";
export type ProductionOrderResolution = { status: "RESOLVED"; productionOrder: ProductionOrderRecord } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; options: ProductionOrderRecord[] };
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+]/g, "");
export function resolveProductionOrderReference(productionOrders: readonly ProductionOrderRecord[], reference: string): ProductionOrderResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const exact = productionOrders.filter((order) => normalize(order.orderNumber) === needle);
  if (exact.length === 1) return { status: "RESOLVED", productionOrder: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = productionOrders.filter((order) => normalize(order.orderNumber).includes(needle));
  if (partial.length === 1) return { status: "RESOLVED", productionOrder: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
