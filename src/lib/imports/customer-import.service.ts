import { detectCustomerDuplicates, type CustomerDuplicateCandidate } from "@/lib/customers/customer-duplicate-detection";
import { getCustomerByIdForOrganization } from "@/lib/core/customers/customer.service";
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

// customer.update writes billingAddress as a single JSON column, not
// merged sub-field by sub-field — an update proposition whose billing
// address value is just { line1 } would silently wipe any existing line2/
// city/postalCode/country the customer already had, for a row that only
// ever intended to supply/correct the one line the spreadsheet carries.
// Read the target's current address first and layer the imported line1
// on top of it, so an update never has to be all-or-nothing on this field.
async function resolveBillingAddressForUpdate(organizationId: string, customerId: string, importedLine1: string): Promise<Record<string, unknown>> {
  const customer = await getCustomerByIdForOrganization(customerId, organizationId);
  const existing = customer?.billingAddress;
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, line1: importedLine1 };
}

export async function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[], organizationId: string): Promise<BusinessProposition[]> {
  const relevantRows = rows.filter((row) => row.action !== "skip" && row.values.displayName);
  const propositions: BusinessProposition[] = [];
  for (const row of relevantRows) {
    if (row.action === "update" && row.mergeTargetId) {
      const billingAddress = row.values.billingAddress
        ? await resolveBillingAddressForUpdate(organizationId, row.mergeTargetId, row.values.billingAddress)
        : undefined;
      propositions.push({
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
          proposedValue: field === "billingAddress" ? billingAddress : row.values[field],
        })),
      });
      continue;
    }
    propositions.push({
      propositionId: crypto.randomUUID(),
      propositionType: "customer_spreadsheet_import",
      targetDomain: "Customer",
      entityResolutionStatus: "NEW_ENTITY" as const,
      operation: "CREATE" as const,
      requiresApproval: true,
      provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
      changes: CUSTOMER_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
        fieldPath: field,
        // customer.create's patch validator requires billingAddress as an
        // object ({ line1 }) — there's no existing record to merge with yet.
        proposedValue: field === "billingAddress" ? { line1: row.values[field] } : row.values[field],
      })),
    });
  }
  return propositions;
}
