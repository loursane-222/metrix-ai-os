export type CustomerImportField = "displayName" | "legalName" | "taxNumber" | "taxOffice" | "phone" | "email" | "billingAddress" | "cariKodu";

export const CUSTOMER_IMPORT_FIELDS: readonly CustomerImportField[] = ["displayName", "legalName", "taxNumber", "taxOffice", "phone", "email", "billingAddress", "cariKodu"];

// Same Turkish-diacritic-insensitive normalization as customer-resolution.ts's
// `normalize`, reused here for header matching instead of record matching.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

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

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, CustomerImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, CustomerImportField | "unmapped"> = {};
  const claimedFields = new Set<CustomerImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = CUSTOMER_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
