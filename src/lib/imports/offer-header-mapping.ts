export type OfferImportField = "customerRef" | "title" | "amount" | "currency";

export const OFFER_IMPORT_FIELDS: readonly OfferImportField[] = ["customerRef", "title", "amount", "currency"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<OfferImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  title: ["aciklama", "teklifbasligi", "konu"],
  amount: ["tutar", "tekliftutari", "toplam"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, OfferImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, OfferImportField | "unmapped"> = {};
  const claimedFields = new Set<OfferImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = OFFER_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
