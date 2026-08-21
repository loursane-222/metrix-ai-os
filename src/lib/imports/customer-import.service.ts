import { detectCustomerDuplicates, type CustomerDuplicateCandidate } from "@/lib/customers/customer-duplicate-detection";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, CUSTOMER_IMPORT_FIELDS, type CustomerImportField, type ColumnMapping } from "./customer-header-mapping";

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<CustomerImportField, string>>;
  duplicates: readonly CustomerDuplicateCandidate[];
  excluded: boolean;
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
  const { mapping, unmapped } = detectColumnMapping(input.headers);
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

    previewRows.push({ rowIndex: index, values, duplicates, excluded: hasStrongDuplicate });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, duplicateCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.values.displayName)
    .map((row) => ({
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
    }));
}
