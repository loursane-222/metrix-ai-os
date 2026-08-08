import type { DeliveryRecord } from "./deliveries-client";

export type DeliveryResolution =
  | { status: "RESOLVED"; delivery: DeliveryRecord }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS"; options: DeliveryRecord[] };

const normalize = (v: string) =>
  v.trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+-]/g, "");

export function resolveDeliveryReference(deliveries: readonly DeliveryRecord[], reference: string): DeliveryResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const exact = deliveries.filter((d) => [d.id, d.deliveryNumber].some((v) => v && normalize(v) === needle));
  if (exact.length === 1) return { status: "RESOLVED", delivery: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = deliveries.filter((d) => [d.deliveryNumber].some((v) => v && normalize(v).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", delivery: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
