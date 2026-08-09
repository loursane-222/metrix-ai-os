import type { StockRecord, WarehouseRecord } from "./stocks-client";

export type StockResolution = { status: "RESOLVED"; stock: StockRecord } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; options: StockRecord[] };
export type WarehouseResolution = { status: "RESOLVED"; warehouse: WarehouseRecord } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; options: WarehouseRecord[] };

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function resolveStockReference(stocks: readonly StockRecord[], reference: string): StockResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const fields = (s: StockRecord) => [s.id, s.productService.name, s.warehouse.name, s.warehouse.code, s.lot, s.batch, s.serialNumber];
  const exact = stocks.filter((s) => fields(s).some((v) => v && normalize(v) === needle));
  if (exact.length === 1) return { status: "RESOLVED", stock: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = stocks.filter((s) => fields(s).some((v) => v && normalize(v).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", stock: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}

export function resolveWarehouseReference(warehouses: readonly WarehouseRecord[], reference: string): WarehouseResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const fields = (w: WarehouseRecord) => [w.id, w.name, w.code];
  const exact = warehouses.filter((w) => fields(w).some((v) => v && normalize(v) === needle));
  if (exact.length === 1) return { status: "RESOLVED", warehouse: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = warehouses.filter((w) => fields(w).some((v) => v && normalize(v).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", warehouse: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
