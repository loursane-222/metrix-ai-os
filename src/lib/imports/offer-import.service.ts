import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference, type CustomerResolution } from "@/lib/customers/customer-resolution";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, OFFER_IMPORT_FIELDS, type OfferImportField, type ColumnMapping } from "./offer-header-mapping";

export type OfferCustomerMatch = Readonly<
  | { status: "RESOLVED"; customerId: string; customerName: string }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<OfferImportField, string>>;
  customerMatch: OfferCustomerMatch;
  excluded: boolean;
}>;

export type OfferImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedCustomerCount: number;
}>;

function toCustomerMatch(resolution: CustomerResolution): OfferCustomerMatch {
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", customerId: resolution.customer.id, customerName: resolution.customer.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

// Teklif geçmişi, tahsilat gibi doğal bir benzersiz anahtar taşımıyor — aynı
// müşteriye aynı başlık/tutarla iki ayrı teklif verilmiş olması gayet olağan,
// bu yüzden önizleme yalnızca müşteri referansını çözer, satırları birbirine
// göre yinelenen olarak işaretlemez.
export async function previewOfferImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<OfferImportPreview> {
  const { mapping, unmapped } = detectColumnMapping(input.headers);
  const customers = await listCustomers({ organizationId: input.organizationId, limit: 5000 });

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedCustomerCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<OfferImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row that can't identify a customer or carries no title can't become
    // a Quote (both are required by quote.create) — silently drop it rather
    // than surfacing a row with nothing importable.
    if (!values.customerRef || !values.title) continue;

    const customerMatch = toCustomerMatch(resolveCustomerReference(customers, values.customerRef));
    const excluded = customerMatch.status !== "RESOLVED";
    if (excluded) unresolvedCustomerCount += 1;

    previewRows.push({ rowIndex: index, values, customerMatch, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedCustomerCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED" && row.values.title)
    .map((row) => {
      const match = row.customerMatch as Extract<OfferCustomerMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "customerId", proposedValue: match.customerId },
        ...OFFER_IMPORT_FIELDS.filter((field) => field !== "customerRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "offer_spreadsheet_import",
        targetDomain: "Quote",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
