export type ProductImportField = "name" | "type" | "category" | "unit" | "currency";

export const PRODUCT_IMPORT_FIELDS: readonly ProductImportField[] = ["name", "type", "category", "unit", "currency"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<ProductImportField, readonly string[]> = {
  name: ["urunadi", "urun", "hizmetadi", "stokadi", "malzemeadi"],
  type: ["tur", "tip", "urunhizmet"],
  category: ["kategori", "grup", "urungrubu"],
  unit: ["birim", "olcubirimi"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, ProductImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, ProductImportField | "unmapped"> = {};
  const claimedFields = new Set<ProductImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = PRODUCT_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
