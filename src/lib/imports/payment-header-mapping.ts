export type PaymentImportField = "customerRef" | "title" | "amount" | "currency" | "dueDate";

export const PAYMENT_IMPORT_FIELDS: readonly PaymentImportField[] = ["customerRef", "title", "amount", "currency", "dueDate"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<PaymentImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  title: ["aciklama", "tahsilatbasligi", "konu"],
  amount: ["tutar", "tahsilattutari", "bakiye"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  dueDate: ["vade", "vadetarihi", "sondemetarih"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, PaymentImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, PaymentImportField | "unmapped"> = {};
  const claimedFields = new Set<PaymentImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = PAYMENT_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
