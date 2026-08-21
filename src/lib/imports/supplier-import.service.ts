import { findSupplierByIdentity } from "@/lib/core/suppliers/supplier.repository";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, SUPPLIER_IMPORT_FIELDS, type SupplierImportField, type ColumnMapping } from "./supplier-header-mapping";

export type ImportRowAction = "create" | "update" | "skip";

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<SupplierImportField, string>>;
  // Same-identity match (name or tax number, mirroring the executor's own
  // findSupplierByIdentity dedup check) — present only when the row would
  // hit that check at commit time.
  mergeTargetId: string | null;
  mergeTargetName: string | null;
  action: ImportRowAction;
}>;

export type SupplierImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  duplicateCount: number;
}>;

export async function previewSupplierImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<SupplierImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const previewRows: ImportPreviewRow[] = [];
  let duplicateCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<SupplierImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row with no name at all can't become a Supplier (displayName is the
    // only required field) — silently drop it from the preview rather than
    // surfacing a row with nothing to import.
    if (!values.displayName) continue;

    const existing = await findSupplierByIdentity(input.organizationId, values.displayName, values.taxNumber);
    if (existing) duplicateCount += 1;

    previewRows.push({
      rowIndex: index,
      values,
      mergeTargetId: existing?.id ?? null,
      mergeTargetName: existing?.displayName ?? null,
      action: existing ? "skip" : "create",
    });
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
          propositionType: "supplier_spreadsheet_import",
          targetDomain: "Supplier",
          targetRecordId: row.mergeTargetId,
          entityResolutionStatus: "RESOLVED" as const,
          operation: "UPDATE" as const,
          requiresApproval: true,
          provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
          changes: SUPPLIER_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
            fieldPath: field,
            proposedValue: row.values[field],
          })),
        };
      }
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "supplier_spreadsheet_import",
        targetDomain: "Supplier",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes: SUPPLIER_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      };
    });
}
