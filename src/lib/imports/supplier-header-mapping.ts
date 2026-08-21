export type SupplierImportField = "displayName" | "legalName" | "phone" | "email" | "website" | "taxNumber" | "taxOffice" | "currency";

export const SUPPLIER_IMPORT_FIELDS: readonly SupplierImportField[] = ["displayName", "legalName", "phone", "email", "website", "taxNumber", "taxOffice", "currency"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

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

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, SupplierImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, SupplierImportField | "unmapped"> = {};
  const claimedFields = new Set<SupplierImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = SUPPLIER_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
    if (field) {
      mapping[header] = field;
      claimedFields.add(field);
    } else {
      mapping[header] = "unmapped";
    }
  }
  const unmapped = headers.filter((header) => mapping[header] === "unmapped");
  return { mapping, unmapped };
}
