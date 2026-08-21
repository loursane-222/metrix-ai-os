import { detectCustomerDuplicates, type CustomerDuplicateCandidate } from "@/lib/customers/customer-duplicate-detection";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, CUSTOMER_IMPORT_FIELDS, type CustomerImportField, type ColumnMapping } from "./customer-header-mapping";

export type ImportRowAction = "create" | "update" | "skip";

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<CustomerImportField, string>>;
  duplicates: readonly CustomerDuplicateCandidate[];
  // Set only when duplicates resolves to exactly one candidate — merging
  // into one of several ambiguous matches would be a guess, so "update" is
  // only offered (mergeTargetId non-null) in the unambiguous case.
  mergeTargetId: string | null;
  action: ImportRowAction;
}>;

export type CustomerImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  duplicateCount: number;
}>;

export async function previewCustomerImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<CustomerImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const previewRows: ImportPreviewRow[] = [];
  let duplicateCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<CustomerImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row with no name at all can't become a Customer (displayName is the
    // only required field) — silently drop it from the preview rather than
    // surfacing a row with nothing to import.
    if (!values.displayName) continue;

    const duplicateQuery: Record<string, unknown> = {};
    if (values.taxNumber) duplicateQuery["customer.taxNumber"] = values.taxNumber;
    if (values.legalName) duplicateQuery["customer.legalName"] = values.legalName;
    if (values.cariKodu) duplicateQuery["customer.cariKodu"] = values.cariKodu;
    if (values.email) duplicateQuery["customer.email"] = values.email;
    if (values.phone) duplicateQuery["customer.phone"] = values.phone;
    const duplicates = Object.keys(duplicateQuery).length ? await detectCustomerDuplicates(input.organizationId, duplicateQuery) : [];
    const hasStrongDuplicate = duplicates.some((duplicate) => duplicate.strength === "STRONG");
    if (hasStrongDuplicate) duplicateCount += 1;
    const mergeTargetId = duplicates.length === 1 ? duplicates[0]!.customerId : null;

    previewRows.push({ rowIndex: index, values, duplicates, mergeTargetId, action: hasStrongDuplicate ? "skip" : "create" });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, duplicateCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => row.action !== "skip" && row.values.displayName)
    .map((row) => {
      if (row.action === "update" && row.mergeTargetId) {
        return {
          propositionId: crypto.randomUUID(),
          propositionType: "customer_spreadsheet_import",
          targetDomain: "Customer",
          targetRecordId: row.mergeTargetId,
          entityResolutionStatus: "RESOLVED" as const,
          operation: "UPDATE" as const,
          requiresApproval: true,
          provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
          changes: CUSTOMER_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
            fieldPath: field,
            // customer.update's patch validator requires billingAddress as an
            // object ({ line1 }) — the same shape customer.create wraps it in.
            proposedValue: field === "billingAddress" ? { line1: row.values[field] } : row.values[field],
          })),
        };
      }
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "customer_spreadsheet_import",
        targetDomain: "Customer",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes: CUSTOMER_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      };
    });
}
