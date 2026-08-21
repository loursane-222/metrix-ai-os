export type InvoiceImportField = "customerRef" | "invoiceNumber" | "title" | "amount" | "taxRate" | "currency" | "dueDate";

export const INVOICE_IMPORT_FIELDS: readonly InvoiceImportField[] = ["customerRef", "invoiceNumber", "title", "amount", "taxRate", "currency", "dueDate"];

// Same Turkish-diacritic-insensitive normalization as customer-header-mapping.ts.
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<InvoiceImportField, readonly string[]> = {
  customerRef: ["musteri", "cari", "cariadi", "musteriadi", "firma", "unvan"],
  invoiceNumber: ["faturano", "faturanumarasi", "belgeno"],
  title: ["aciklama", "faturabasligi", "konu", "hizmet"],
  amount: ["tutar", "matrah", "faturatutari", "birimfiyat"],
  taxRate: ["kdv", "kdvorani", "vergiorani"],
  currency: ["parabirimi", "dovizcinsi", "kur"],
  dueDate: ["vade", "vadetarihi", "sondemetarih"],
};

export type ColumnMapping = Readonly<{
  mapping: Readonly<Record<string, InvoiceImportField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping(headers: readonly string[]): ColumnMapping {
  const mapping: Record<string, InvoiceImportField | "unmapped"> = {};
  const claimedFields = new Set<InvoiceImportField>();
  for (const header of headers) {
    const needle = normalize(header);
    const field = INVOICE_IMPORT_FIELDS.find((candidate) => !claimedFields.has(candidate) && HEADER_ALIASES[candidate].includes(needle));
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
