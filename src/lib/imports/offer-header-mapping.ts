import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type OfferImportField = "customerRef" | "title" | "amount" | "currency";

export const OFFER_IMPORT_FIELDS: readonly OfferImportField[] = ["customerRef", "title", "amount", "currency"];

export const OFFER_FIELD_LABELS: Record<OfferImportField, string> = {
  customerRef: "Müşteri",
  title: "Açıklama",
  amount: "Tutar",
  currency: "Para Birimi",
};

const HEADER_ALIASES: Record<OfferImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  title: ["aciklama", "teklifbasligi", "konu"],
  amount: ["tutar", "tekliftutari", "toplam"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<OfferImportField, ValueShapeConstraint>> = {
  customerRef: "must-not-be-digits",
  title: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly OfferImportField[] = ["customerRef", "title"];

export type ColumnMapping = GenericColumnMapping<OfferImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, OFFER_IMPORT_FIELDS, HEADER_ALIASES, OFFER_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
