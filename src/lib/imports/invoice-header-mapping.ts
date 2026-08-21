import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type InvoiceImportField = "customerRef" | "invoiceNumber" | "title" | "amount" | "taxRate" | "currency" | "dueDate";

export const INVOICE_IMPORT_FIELDS: readonly InvoiceImportField[] = ["customerRef", "invoiceNumber", "title", "amount", "taxRate", "currency", "dueDate"];

export const INVOICE_FIELD_LABELS: Record<InvoiceImportField, string> = {
  customerRef: "Müşteri",
  invoiceNumber: "Fatura No",
  title: "Açıklama",
  amount: "Tutar",
  taxRate: "KDV Oranı",
  currency: "Para Birimi",
  dueDate: "Vade Tarihi",
};

const HEADER_ALIASES: Record<InvoiceImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  invoiceNumber: ["faturano", "faturanumarasi", "belgeno"],
  title: ["aciklama", "faturabasligi", "konu", "hizmet"],
  amount: ["tutar", "matrah", "faturatutari", "birimfiyat"],
  taxRate: ["kdv", "kdvorani", "vergiorani"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  dueDate: ["vade", "vadetarihi", "sondemetarih"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<InvoiceImportField, ValueShapeConstraint>> = {
  customerRef: "must-not-be-digits",
  title: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly InvoiceImportField[] = ["customerRef", "title", "amount"];

export type ColumnMapping = GenericColumnMapping<InvoiceImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, INVOICE_IMPORT_FIELDS, HEADER_ALIASES, INVOICE_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
