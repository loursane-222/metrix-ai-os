import type { OrderRecord } from "./orders-client";

export type OrderResolution =
  | { status: "RESOLVED"; order: OrderRecord }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS"; options: OrderRecord[] };

const normalize = (v: string) =>
  v.trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+-]/g, "");

export function resolveOrderReference(orders: readonly OrderRecord[], reference: string): OrderResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const exact = orders.filter((o) => [o.id, o.orderNumber].some((v) => v && normalize(v) === needle));
  if (exact.length === 1) return { status: "RESOLVED", order: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = orders.filter((o) => [o.orderNumber].some((v) => v && normalize(v).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", order: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
