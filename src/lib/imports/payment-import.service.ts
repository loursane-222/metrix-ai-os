import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference, type CustomerResolution } from "@/lib/customers/customer-resolution";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, PAYMENT_IMPORT_FIELDS, type PaymentImportField, type ColumnMapping } from "./payment-header-mapping";

export type PaymentCustomerMatch = Readonly<
  | { status: "RESOLVED"; customerId: string; customerName: string }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<PaymentImportField, string>>;
  customerMatch: PaymentCustomerMatch;
  excluded: boolean;
}>;

export type PaymentImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedCustomerCount: number;
}>;

function toCustomerMatch(resolution: CustomerResolution): PaymentCustomerMatch {
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", customerId: resolution.customer.id, customerName: resolution.customer.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

// Tahsilat/receivable rows don't carry a natural unique key (unlike Invoice's
// invoiceNumber) — a real business can legitimately have two separate
// receivables of the same amount/title for the same customer, so this
// preview only resolves the customer reference; it never flags or excludes
// rows as duplicates of each other.
export async function previewPaymentImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<PaymentImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const customers = await listCustomers({ organizationId: input.organizationId, limit: 5000 });

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedCustomerCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<PaymentImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row that can't identify a customer or carries no title/amount can't
    // become a Payment (all three are required by payment.create) — silently
    // drop it rather than surfacing a row with nothing importable.
    if (!values.customerRef || !values.title || !values.amount) continue;

    const customerMatch = toCustomerMatch(resolveCustomerReference(customers, values.customerRef));
    const excluded = customerMatch.status !== "RESOLVED";
    if (excluded) unresolvedCustomerCount += 1;

    previewRows.push({ rowIndex: index, values, customerMatch, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedCustomerCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED" && row.values.title && row.values.amount)
    .map((row) => {
      const match = row.customerMatch as Extract<PaymentCustomerMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "customerId", proposedValue: match.customerId },
        ...PAYMENT_IMPORT_FIELDS.filter((field) => field !== "customerRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "payment_spreadsheet_import",
        targetDomain: "Payment",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
