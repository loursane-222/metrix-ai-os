import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type StockImportField = "productRef" | "warehouseRef" | "quantity" | "lot" | "batch" | "serialNumber" | "location";

export const STOCK_IMPORT_FIELDS: readonly StockImportField[] = ["productRef", "warehouseRef", "quantity", "lot", "batch", "serialNumber", "location"];

export const STOCK_FIELD_LABELS: Record<StockImportField, string> = {
  productRef: "Ürün",
  warehouseRef: "Depo",
  quantity: "Miktar",
  lot: "Lot",
  batch: "Parti",
  serialNumber: "Seri No",
  location: "Konum",
};

const HEADER_ALIASES: Record<StockImportField, readonly string[]> = {
  productRef: ["urunadi", "urun", "stokadi", "malzemeadi"],
  warehouseRef: ["depo", "depoadi", "warehouse"],
  quantity: ["miktar", "adet", "stokmiktari"],
  lot: ["lot", "lotno"],
  batch: ["parti", "partino", "batch"],
  serialNumber: ["serino"],
  location: ["konum", "raf", "lokasyon"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<StockImportField, ValueShapeConstraint>> = {
  productRef: "must-not-be-digits",
  warehouseRef: "must-not-be-digits",
  quantity: "must-be-digits",
};

const REQUIRED_FIELDS: readonly StockImportField[] = ["productRef", "quantity"];

export type ColumnMapping = GenericColumnMapping<StockImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, STOCK_IMPORT_FIELDS, HEADER_ALIASES, STOCK_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
