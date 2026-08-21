import { listProductServices } from "@/lib/core/products/product.service";
import { listWarehousesForOrganization } from "@/lib/core/stock/stock.service";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, STOCK_IMPORT_FIELDS, type StockImportField, type ColumnMapping } from "./stock-header-mapping";

export type StockMatch = Readonly<
  | { status: "RESOLVED"; id: string; label: string }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
  | { status: "MISSING_MULTIPLE_WAREHOUSES" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<StockImportField, string>>;
  productMatch: StockMatch;
  warehouseMatch: StockMatch;
  excluded: boolean;
}>;

export type StockImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedCount: number;
}>;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function matchByName(items: readonly { id: string; name: string }[], reference: string): StockMatch {
  const needle = normalize(reference);
  const exact = items.filter((item) => normalize(item.name) === needle);
  if (exact.length === 1) return { status: "RESOLVED", id: exact[0]!.id, label: exact[0]!.name };
  if (exact.length > 1) return { status: "AMBIGUOUS" };
  const partial = items.filter((item) => normalize(item.name).includes(needle));
  if (partial.length === 1) return { status: "RESOLVED", id: partial[0]!.id, label: partial[0]!.name };
  if (partial.length > 1) return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}

// Stock rows always target a specific Product+Warehouse pair, but most
// businesses run a single warehouse — requiring a warehouse column for every
// row would be needless friction, so a row with no warehouse reference
// silently uses the org's one warehouse when there's exactly one.
export async function previewStockImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<StockImportPreview> {
  const { mapping, unmapped } = detectColumnMapping(input.headers);
  const [products, warehouses] = await Promise.all([
    listProductServices({ organizationId: input.organizationId, limit: 1000 }).then((list) => list.filter((product) => product.status !== "ARCHIVED")),
    listWarehousesForOrganization(input.organizationId),
  ]);
  const singleWarehouse = warehouses.length === 1 ? warehouses[0]! : null;

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<StockImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row with no product reference or no quantity can't become a stock
    // receipt (both required by stock.receive) — silently drop it rather
    // than surfacing a row with nothing importable.
    if (!values.productRef || !values.quantity) continue;

    const productMatch = matchByName(products, values.productRef);
    const warehouseMatch: StockMatch = values.warehouseRef
      ? matchByName(warehouses, values.warehouseRef)
      : singleWarehouse
        ? { status: "RESOLVED", id: singleWarehouse.id, label: singleWarehouse.name }
        : { status: "MISSING_MULTIPLE_WAREHOUSES" };

    const excluded = productMatch.status !== "RESOLVED" || warehouseMatch.status !== "RESOLVED";
    if (excluded) unresolvedCount += 1;

    previewRows.push({ rowIndex: index, values, productMatch, warehouseMatch, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.productMatch.status === "RESOLVED" && row.warehouseMatch.status === "RESOLVED" && row.values.quantity)
    .map((row) => {
      const product = row.productMatch as Extract<StockMatch, { status: "RESOLVED" }>;
      const warehouse = row.warehouseMatch as Extract<StockMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "productServiceId", proposedValue: product.id },
        { fieldPath: "warehouseId", proposedValue: warehouse.id },
        ...STOCK_IMPORT_FIELDS.filter((field) => field !== "productRef" && field !== "warehouseRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "stock_spreadsheet_import",
        targetDomain: "Stock",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
