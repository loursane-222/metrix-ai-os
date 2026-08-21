import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping, type ValueShapeConstraint } from "./column-mapping";

export type SupplierImportField = "displayName" | "legalName" | "phone" | "email" | "website" | "taxNumber" | "taxOffice" | "currency";

export const SUPPLIER_IMPORT_FIELDS: readonly SupplierImportField[] = ["displayName", "legalName", "phone", "email", "website", "taxNumber", "taxOffice", "currency"];

export const SUPPLIER_FIELD_LABELS: Record<SupplierImportField, string> = {
  displayName: "Tedarikçi Adı",
  legalName: "Ticari Ünvan",
  phone: "Telefon",
  email: "E-posta",
  website: "Web Sitesi",
  taxNumber: "Vergi No",
  taxOffice: "Vergi Dairesi",
  currency: "Para Birimi",
};

const HEADER_ALIASES: Record<SupplierImportField, readonly string[]> = {
  displayName: ["unvan", "tedarikciadi", "tedarikci", "firma", "firmaadi"],
  legalName: ["ticariunvan", "unvani", "resmiunvan", "yasalunvan"],
  phone: ["telefon", "tel", "gsm", "cepno", "telefonno"],
  email: ["eposta", "email", "epostaadresi", "mail"],
  website: ["websitesi", "web", "internetsitesi"],
  taxNumber: ["vergino", "vergikimlikno", "vkn"],
  taxOffice: ["vergidairesi", "vd"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
};

// Sanity check on the AI fallback's proposed mapping (see column-mapping.ts).
const VALUE_SHAPES: Partial<Record<SupplierImportField, ValueShapeConstraint>> = {
  displayName: "must-not-be-digits",
  legalName: "must-not-be-digits",
  phone: "must-be-digits",
  email: "must-not-be-digits",
  website: "must-not-be-digits",
  taxNumber: "must-be-digits",
  taxOffice: "must-not-be-digits",
  currency: "must-not-be-digits",
};

const REQUIRED_FIELDS: readonly SupplierImportField[] = ["displayName"];

export type ColumnMapping = GenericColumnMapping<SupplierImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, SUPPLIER_IMPORT_FIELDS, HEADER_ALIASES, SUPPLIER_FIELD_LABELS, VALUE_SHAPES, REQUIRED_FIELDS);
}
