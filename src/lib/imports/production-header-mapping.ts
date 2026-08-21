export type ProductionImportField = "orderNumber" | "productRef" | "quantityPlanned" | "plannedStartAt" | "plannedEndAt" | "notes";

export const PRODUCTION_IMPORT_FIELDS: readonly ProductionImportField[] = ["orderNumber", "productRef", "quantityPlanned", "plannedStartAt", "plannedEndAt", "notes"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<ProductionImportField, readonly string[]> = {
  orderNumber: ["emirno", "uretimemirno", "isemri", "emirnumarasi"],
  productRef: ["urunadi", "urun", "stokadi"],
  quantityPlanned: ["planlananmiktar", "miktar", "adet"],
  plannedStartAt: ["baslangictarihi", "planlananbaslangic"],
  plannedEndAt: ["bitistarihi", "planlananbitis", "termintarihi"],
  notes: ["not", "aciklama", "notlar"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, ProductionImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, ProductionImportField | "unmapped"> = {};
  const claimedFields = new Set<ProductionImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = PRODUCTION_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
