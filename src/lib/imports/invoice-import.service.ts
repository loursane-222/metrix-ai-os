import { prisma } from "@/lib/core/shared/prisma";
import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference, type CustomerResolution } from "@/lib/customers/customer-resolution";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, INVOICE_IMPORT_FIELDS, type InvoiceImportField, type ColumnMapping } from "./invoice-header-mapping";

export type InvoiceCustomerMatch = Readonly<
  | { status: "RESOLVED"; customerId: string; customerName: string }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<InvoiceImportField, string>>;
  customerMatch: InvoiceCustomerMatch;
  // Unlike offer/order/payment, Invoice has a real natural key: invoiceNumber
  // is unique per organization at the DB level (@@unique([organizationId,
  // invoiceNumber])). Re-importing the same file after a partial commit
  // would otherwise re-attempt the already-created invoice numbers and fail
  // with an opaque constraint error — flag it here instead so it defaults
  // to skipped, same as the other imports' duplicate handling.
  isDuplicateInvoiceNumber: boolean;
  excluded: boolean;
}>;

export type InvoiceImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedCustomerCount: number;
  duplicateInvoiceNumberCount: number;
}>;

function toCustomerMatch(resolution: CustomerResolution): InvoiceCustomerMatch {
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", customerId: resolution.customer.id, customerName: resolution.customer.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

export async function previewInvoiceImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<InvoiceImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const [customers, existingInvoices] = await Promise.all([
    listCustomers({ organizationId: input.organizationId, limit: 5000 }),
    prisma.invoice.findMany({ where: { organizationId: input.organizationId }, select: { invoiceNumber: true } }),
  ]);
  const existingInvoiceNumbers = new Set(existingInvoices.map((invoice) => invoice.invoiceNumber));

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedCustomerCount = 0;
  let duplicateInvoiceNumberCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<InvoiceImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row that can't identify a customer or carries no title/amount can't
    // become an Invoice (all three are required by invoice.create) — silently
    // drop it rather than surfacing a row with nothing importable.
    if (!values.customerRef || !values.title || !values.amount) continue;

    const customerMatch = toCustomerMatch(resolveCustomerReference(customers, values.customerRef));
    const isDuplicateInvoiceNumber = Boolean(values.invoiceNumber && existingInvoiceNumbers.has(values.invoiceNumber));
    if (customerMatch.status !== "RESOLVED") unresolvedCustomerCount += 1;
    if (isDuplicateInvoiceNumber) duplicateInvoiceNumberCount += 1;
    const excluded = customerMatch.status !== "RESOLVED" || isDuplicateInvoiceNumber;

    previewRows.push({ rowIndex: index, values, customerMatch, isDuplicateInvoiceNumber, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedCustomerCount, duplicateInvoiceNumberCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED" && row.values.title && row.values.amount)
    .map((row) => {
      const match = row.customerMatch as Extract<InvoiceCustomerMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "customerId", proposedValue: match.customerId },
        ...INVOICE_IMPORT_FIELDS.filter((field) => field !== "customerRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "invoice_spreadsheet_import",
        targetDomain: "Invoice",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
