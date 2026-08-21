import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference, type CustomerResolution } from "@/lib/customers/customer-resolution";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, ORDER_IMPORT_FIELDS, type OrderImportField, type ColumnMapping } from "./order-header-mapping";

export type OrderCustomerMatch = Readonly<
  | { status: "RESOLVED"; customerId: string; customerName: string }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<OrderImportField, string>>;
  customerMatch: OrderCustomerMatch;
  excluded: boolean;
}>;

export type OrderImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedCustomerCount: number;
}>;

function toCustomerMatch(resolution: CustomerResolution): OrderCustomerMatch {
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", customerId: resolution.customer.id, customerName: resolution.customer.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

// order.create assigns a fresh sequential order number the same way
// invoice.create used to — but unlike an invoice number, an order number
// carries no e-fatura/audit weight in Turkey, so this import doesn't try to
// preserve the source system's original order reference.
export async function previewOrderImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<OrderImportPreview> {
  const { mapping, unmapped } = detectColumnMapping(input.headers);
  const customers = await listCustomers({ organizationId: input.organizationId, limit: 5000 });

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedCustomerCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<OrderImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row that can't identify a customer can't become an Order
    // (order.create requires a real customerId) — silently drop it rather
    // than surfacing a row with nothing importable.
    if (!values.customerRef) continue;

    const customerMatch = toCustomerMatch(resolveCustomerReference(customers, values.customerRef));
    const excluded = customerMatch.status !== "RESOLVED";
    if (excluded) unresolvedCustomerCount += 1;

    previewRows.push({ rowIndex: index, values, customerMatch, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedCustomerCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED")
    .map((row) => {
      const match = row.customerMatch as Extract<OrderCustomerMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "customerId", proposedValue: match.customerId },
        ...ORDER_IMPORT_FIELDS.filter((field) => field !== "customerRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "order_spreadsheet_import",
        targetDomain: "Order",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
