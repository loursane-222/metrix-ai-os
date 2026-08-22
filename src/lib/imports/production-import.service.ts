import { prisma } from "@/lib/core/shared/prisma";
import { listProductServices } from "@/lib/core/products/product.service";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, PRODUCTION_IMPORT_FIELDS, type ProductionImportField, type ColumnMapping } from "./production-header-mapping";

export type ProductMatch = Readonly<{ status: "RESOLVED"; id: string; label: string } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS" }>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<ProductionImportField, string>>;
  // null when the row simply doesn't name a product (allowed — productServiceId
  // is optional on a production order); a real match object only when a
  // productRef was given, so an unresolved reference can still be flagged.
  productMatch: ProductMatch | null;
  // orderNumber (emir no) is a required field and the natural business key
  // for a production order, same role invoiceNumber plays for invoices — a
  // re-imported file after a partial commit should skip an already-created
  // order number instead of creating a second production order for it.
  isDuplicateOrderNumber: boolean;
  excluded: boolean;
}>;

export type ProductionImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedProductCount: number;
  duplicateOrderNumberCount: number;
}>;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function matchByName(items: readonly { id: string; name: string }[], reference: string): ProductMatch {
  const needle = normalize(reference);
  const exact = items.filter((item) => normalize(item.name) === needle);
  if (exact.length === 1) return { status: "RESOLVED", id: exact[0]!.id, label: exact[0]!.name };
  if (exact.length > 1) return { status: "AMBIGUOUS" };
  const partial = items.filter((item) => normalize(item.name).includes(needle));
  if (partial.length === 1) return { status: "RESOLVED", id: partial[0]!.id, label: partial[0]!.name };
  if (partial.length > 1) return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

export async function previewProductionImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<ProductionImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const [products, existingOrders] = await Promise.all([
    listProductServices({ organizationId: input.organizationId, limit: 1000 }).then((list) => list.filter((product) => product.status !== "ARCHIVED")),
    prisma.productionOrder.findMany({ where: { organizationId: input.organizationId }, select: { orderNumber: true } }),
  ]);
  const existingOrderNumbers = new Set(existingOrders.map((order) => order.orderNumber));

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedProductCount = 0;
  let duplicateOrderNumberCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<ProductionImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row with no order number or no planned quantity can't become a
    // ProductionOrder (both required by production.create) — silently drop
    // it rather than surfacing a row with nothing importable.
    if (!values.orderNumber || !values.quantityPlanned) continue;

    const productMatch = values.productRef ? matchByName(products, values.productRef) : null;
    const isDuplicateOrderNumber = existingOrderNumbers.has(values.orderNumber);
    if (productMatch !== null && productMatch.status !== "RESOLVED") unresolvedProductCount += 1;
    if (isDuplicateOrderNumber) duplicateOrderNumberCount += 1;
    const excluded = (productMatch !== null && productMatch.status !== "RESOLVED") || isDuplicateOrderNumber;

    previewRows.push({ rowIndex: index, values, productMatch, isDuplicateOrderNumber, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedProductCount, duplicateOrderNumberCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.values.orderNumber && row.values.quantityPlanned)
    .map((row) => {
      const changes = [
        ...PRODUCTION_IMPORT_FIELDS.filter((field) => field !== "productRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
        ...(row.productMatch?.status === "RESOLVED" ? [{ fieldPath: "productServiceId", proposedValue: row.productMatch.id }] : []),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "production_spreadsheet_import",
        targetDomain: "ProductionOrder",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
