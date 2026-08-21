export type OrderImportField = "customerRef" | "currency" | "notes" | "deadlineAt";

export const ORDER_IMPORT_FIELDS: readonly OrderImportField[] = ["customerRef", "currency", "notes", "deadlineAt"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<OrderImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  notes: ["not", "aciklama", "notlar"],
  deadlineAt: ["termintarihi", "teslimtarihi", "vade", "vadetarihi"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, OrderImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, OrderImportField | "unmapped"> = {};
  const claimedFields = new Set<OrderImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = ORDER_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
