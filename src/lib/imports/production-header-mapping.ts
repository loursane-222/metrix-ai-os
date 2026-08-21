import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type ProductionImportField = "orderNumber" | "productRef" | "quantityPlanned" | "plannedStartAt" | "plannedEndAt" | "notes";

export const PRODUCTION_IMPORT_FIELDS: readonly ProductionImportField[] = ["orderNumber", "productRef", "quantityPlanned", "plannedStartAt", "plannedEndAt", "notes"];

export const PRODUCTION_FIELD_LABELS: Record<ProductionImportField, string> = {
  orderNumber: "Emir No",
  productRef: "Ürün",
  quantityPlanned: "Planlanan Miktar",
  plannedStartAt: "Başlangıç Tarihi",
  plannedEndAt: "Bitiş Tarihi",
  notes: "Not",
};

const HEADER_ALIASES: Record<ProductionImportField, readonly string[]> = {
  orderNumber: ["emirno", "uretimemirno", "isemri", "emirnumarasi"],
  productRef: ["urunadi", "urun", "stokadi"],
  quantityPlanned: ["planlananmiktar", "miktar", "adet"],
  plannedStartAt: ["baslangictarihi", "planlananbaslangic"],
  plannedEndAt: ["bitistarihi", "planlananbitis", "termintarihi"],
  notes: ["not", "aciklama", "notlar"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<ProductionImportField, ValueShapeConstraint>> = {
  productRef: "must-not-be-digits",
  quantityPlanned: "must-be-digits",
};

const REQUIRED_FIELDS: readonly ProductionImportField[] = ["orderNumber", "quantityPlanned"];

export type ColumnMapping = GenericColumnMapping<ProductionImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, PRODUCTION_IMPORT_FIELDS, HEADER_ALIASES, PRODUCTION_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
