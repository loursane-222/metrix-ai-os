export type StockImportField = "productRef" | "warehouseRef" | "quantity" | "lot" | "batch" | "serialNumber" | "location";

export const STOCK_IMPORT_FIELDS: readonly StockImportField[] = ["productRef", "warehouseRef", "quantity", "lot", "batch", "serialNumber", "location"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<StockImportField, readonly string[]> = {
  productRef: ["urunadi", "urun", "stokadi", "malzemeadi"],
  warehouseRef: ["depo", "depoadi", "warehouse"],
  quantity: ["miktar", "adet", "stokmiktari"],
  lot: ["lot", "lotno"],
  batch: ["parti", "partino", "batch"],
  serialNumber: ["serino"],
  location: ["konum", "raf", "lokasyon"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, StockImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, StockImportField | "unmapped"> = {};
  const claimedFields = new Set<StockImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = STOCK_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
