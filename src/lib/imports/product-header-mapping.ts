import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type ProductImportField = "name" | "type" | "category" | "unit" | "currency";

export const PRODUCT_IMPORT_FIELDS: readonly ProductImportField[] = ["name", "type", "category", "unit", "currency"];

export const PRODUCT_FIELD_LABELS: Record<ProductImportField, string> = {
  name: "Ürün/Hizmet Adı",
  type: "Tür",
  category: "Kategori",
  unit: "Birim",
  currency: "Para Birimi",
};

const HEADER_ALIASES: Record<ProductImportField, readonly string[]> = {
  name: ["urunadi", "urun", "hizmetadi", "stokadi", "malzemeadi"],
  type: ["tur", "tip", "urunhizmet"],
  category: ["kategori", "grup", "urungrubu"],
  unit: ["birim", "olcubirimi"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<ProductImportField, ValueShapeConstraint>> = {
  name: "must-not-be-digits",
  type: "must-not-be-digits",
  category: "must-not-be-digits",
  unit: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly ProductImportField[] = ["name"];

export type ColumnMapping = GenericColumnMapping<ProductImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, PRODUCT_IMPORT_FIELDS, HEADER_ALIASES, PRODUCT_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
