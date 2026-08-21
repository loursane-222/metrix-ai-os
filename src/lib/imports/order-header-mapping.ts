import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type OrderImportField = "customerRef" | "currency" | "notes" | "deadlineAt";

export const ORDER_IMPORT_FIELDS: readonly OrderImportField[] = ["customerRef", "currency", "notes", "deadlineAt"];

export const ORDER_FIELD_LABELS: Record<OrderImportField, string> = {
  customerRef: "Müşteri",
  currency: "Para Birimi",
  notes: "Not",
  deadlineAt: "Termin Tarihi",
};

const HEADER_ALIASES: Record<OrderImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  notes: ["not", "aciklama", "notlar"],
  deadlineAt: ["termintarihi", "teslimtarihi", "vade", "vadetarihi"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<OrderImportField, ValueShapeConstraint>> = {
  customerRef: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly OrderImportField[] = ["customerRef"];

export type ColumnMapping = GenericColumnMapping<OrderImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, ORDER_IMPORT_FIELDS, HEADER_ALIASES, ORDER_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
