import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type PaymentImportField = "customerRef" | "title" | "amount" | "currency" | "dueDate";

export const PAYMENT_IMPORT_FIELDS: readonly PaymentImportField[] = ["customerRef", "title", "amount", "currency", "dueDate"];

export const PAYMENT_FIELD_LABELS: Record<PaymentImportField, string> = {
  customerRef: "Müşteri",
  title: "Açıklama",
  amount: "Tutar",
  currency: "Para Birimi",
  dueDate: "Vade Tarihi",
};

const HEADER_ALIASES: Record<PaymentImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  title: ["aciklama", "tahsilatbasligi", "konu"],
  amount: ["tutar", "tahsilattutari", "bakiye"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  dueDate: ["vade", "vadetarihi", "sondemetarih"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<PaymentImportField, ValueShapeConstraint>> = {
  customerRef: "must-not-be-digits",
  title: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly PaymentImportField[] = ["customerRef", "title", "amount"];

export type ColumnMapping = GenericColumnMapping<PaymentImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, PAYMENT_IMPORT_FIELDS, HEADER_ALIASES, PAYMENT_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
