import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type CustomerImportField = "displayName" | "legalName" | "taxNumber" | "taxOffice" | "phone" | "email" | "billingAddress" | "cariKodu";

export const CUSTOMER_IMPORT_FIELDS: readonly CustomerImportField[] = ["displayName", "legalName", "taxNumber", "taxOffice", "phone", "email", "billingAddress", "cariKodu"];

export const CUSTOMER_FIELD_LABELS: Record<CustomerImportField, string> = {
  displayName: "Müşteri Adı",
  legalName: "Ticari Ünvan",
  taxNumber: "Vergi No",
  taxOffice: "Vergi Dairesi",
  phone: "Telefon",
  email: "E-posta",
  billingAddress: "Adres",
  cariKodu: "Cari Kod",
};

const HEADER_ALIASES: Record<CustomerImportField, readonly string[]> = {
  displayName: ["unvan", "musteriadi", "musteri", "adsoyad", "cari", "cariadi", "firma", "firmaadi", "isim"],
  legalName: ["ticariunvan", "unvani", "resmiunvan", "yasalunvan"],
  taxNumber: ["vergino", "vergikimlikno", "vkn", "tckimlikno", "tcno"],
  taxOffice: ["vergidairesi", "vd"],
  phone: ["telefon", "tel", "gsm", "cepno", "telefonno"],
  email: ["eposta", "email", "epostaadresi", "mail"],
  billingAddress: ["adres", "acikadres", "faturaadresi"],
  cariKodu: ["carikod", "carikodu", "musterikodu", "musterino"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts)
// — a name/text field can never be a bare digit string, and a phone/tax
// number is never letters. Live testing caught a phone-number column
// getting confidently mapped to displayName from the header text alone.
const VALUE_SHAPES: Partial<Record<CustomerImportField, ValueShapeConstraint>> = {
  displayName: "must-not-be-digits",
  legalName: "must-not-be-digits",
  taxNumber: "must-be-digits",
  taxOffice: "must-not-be-digits",
  phone: "must-be-digits",
  email: "must-not-be-digits",
  billingAddress: "must-not-be-digits",
};

// A row with no displayName is dropped entirely (see previewCustomerImport)
// — told to the AI so it prefers this over a more "precise" but optional
// field (e.g. legalName) when only one name-like column exists. Live
// testing without this hint correctly identified a company-name column
// as legalName and left displayName empty, silently dropping the row.
const REQUIRED_FIELDS: readonly CustomerImportField[] = ["displayName"];

export type ColumnMapping = GenericColumnMapping<CustomerImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, CUSTOMER_IMPORT_FIELDS, HEADER_ALIASES, CUSTOMER_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
