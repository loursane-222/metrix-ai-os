import { listProductServices } from "@/lib/core/products/product.service";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, PRODUCT_IMPORT_FIELDS, type ProductImportField, type ColumnMapping } from "./product-header-mapping";

export type ProductDuplicateMatch = Readonly<{ productId: string; name: string }>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<ProductImportField, string>>;
  duplicates: readonly ProductDuplicateMatch[];
  excluded: boolean;
}>;

export type ProductImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  duplicateCount: number;
}>;

// Same case/diacritic-insensitive comparison the product.create executor
// (register-product-actions.ts) uses for its own dedup-by-name no-op, so the
// preview's "will match an existing product" flag agrees with what commit
// actually does.
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// The canonical product.create action (register-product-actions.ts) only
// recognizes the literal strings "PRODUCT"/"SERVICE" for its type field —
// anything else it silently treats as "PRODUCT". Spreadsheets carry this as
// free Turkish/English text (Ürün, Hizmet, Mal, Product, Service), so map it
// here instead of passing raw text through to that strict check.
const SERVICE_WORDS = new Set(["hizmet", "servis", "service"]);
function normalizeProductType(raw: string | undefined): "PRODUCT" | "SERVICE" | undefined {
  if (!raw) return undefined;
  return SERVICE_WORDS.has(normalize(raw)) ? "SERVICE" : "PRODUCT";
}

export async function previewProductImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<ProductImportPreview> {
  const { mapping, unmapped } = detectColumnMapping(input.headers);
  const existing = (await listProductServices({ organizationId: input.organizationId, limit: 1000 }))
    .filter((product) => product.status !== "ARCHIVED");
  const existingByName = new Map(existing.map((product) => [normalize(product.name), product]));

  const previewRows: ImportPreviewRow[] = [];
  let duplicateCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<ProductImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    if (values.type) {
      const normalizedType = normalizeProductType(values.type);
      if (normalizedType) values.type = normalizedType;
    }
    // A row with no name at all can't become a ProductService (name is the
    // only required field) — silently drop it rather than surfacing a row
    // with nothing to import.
    if (!values.name) continue;

    const match = existingByName.get(normalize(values.name));
    const duplicates: ProductDuplicateMatch[] = match ? [{ productId: match.id, name: match.name }] : [];
    if (duplicates.length) duplicateCount += 1;

    previewRows.push({ rowIndex: index, values, duplicates, excluded: duplicates.length > 0 });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, duplicateCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.values.name)
    .map((row) => ({
      propositionId: crypto.randomUUID(),
      propositionType: "product_spreadsheet_import",
      targetDomain: "ProductService",
      entityResolutionStatus: "NEW_ENTITY" as const,
      operation: "CREATE" as const,
      requiresApproval: true,
      provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
      changes: PRODUCT_IMPORT_FIELDS.filter((field) => row.values[field]).map((field) => ({
        fieldPath: field,
        proposedValue: row.values[field],
      })),
    }));
}
