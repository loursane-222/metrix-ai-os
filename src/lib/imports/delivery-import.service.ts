import { listOrders } from "@/lib/core/orders/order.service";
import type { BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { detectColumnMapping, DELIVERY_IMPORT_FIELDS, type DeliveryImportField, type ColumnMapping } from "./delivery-header-mapping";

export type DeliveryOrderMatch = Readonly<
  | { status: "RESOLVED"; orderId: string; orderNumber: string; customerId: string }
  | { status: "NOT_FOUND" }
>;

export type ImportPreviewRow = Readonly<{
  rowIndex: number;
  values: Partial<Record<DeliveryImportField, string>>;
  orderMatch: DeliveryOrderMatch;
  excluded: boolean;
}>;

export type DeliveryImportPreview = Readonly<{
  mapping: ColumnMapping["mapping"];
  unmappedHeaders: readonly string[];
  rows: readonly ImportPreviewRow[];
  totalRows: number;
  unresolvedOrderCount: number;
}>;

function resolveOrderReference(
  orders: readonly { id: string; orderNumber: string; customerId: string }[],
  ref: string,
): DeliveryOrderMatch {
  const normalized = ref.trim().toLocaleLowerCase("tr-TR");
  const match = orders.find((order) => order.orderNumber.trim().toLocaleLowerCase("tr-TR") === normalized);
  if (!match) return { status: "NOT_FOUND" };
  return { status: "RESOLVED", orderId: match.id, orderNumber: match.orderNumber, customerId: match.customerId };
}

// delivery.create assigns a fresh sequential delivery number the same way
// order.create does for orders — this import doesn't try to preserve a
// source system's original delivery/waybill reference, only the Order it
// belongs to (Delivery.sourceOrderId is a required FK, so every row must
// resolve to an existing, already-imported-or-created Order first).
export async function previewDeliveryImport(input: {
  organizationId: string;
  headers: readonly string[];
  rows: readonly Record<string, string>[];
}): Promise<DeliveryImportPreview> {
  const { mapping, unmapped } = await detectColumnMapping(input.headers, input.rows);
  const orders = await listOrders({ organizationId: input.organizationId, limit: 500 });

  const previewRows: ImportPreviewRow[] = [];
  let unresolvedOrderCount = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const rawRow = input.rows[index]!;
    const values: Partial<Record<DeliveryImportField, string>> = {};
    for (const header of input.headers) {
      const field = mapping[header];
      if (field === "unmapped") continue;
      const value = rawRow[header]?.trim();
      if (value) values[field] = value;
    }
    // A row that can't identify a source Order can't become a Delivery
    // (Delivery.sourceOrderId is a required FK) — silently drop it rather
    // than surfacing a row with nothing importable.
    if (!values.orderNumberRef) continue;

    const orderMatch = resolveOrderReference(orders, values.orderNumberRef);
    const excluded = orderMatch.status !== "RESOLVED";
    if (excluded) unresolvedOrderCount += 1;

    previewRows.push({ rowIndex: index, values, orderMatch, excluded });
  }

  return { mapping, unmappedHeaders: unmapped, rows: previewRows, totalRows: input.rows.length, unresolvedOrderCount };
}

export function buildPropositionsFromReviewedRows(rows: readonly ImportPreviewRow[]): BusinessProposition[] {
  return rows
    .filter((row) => !row.excluded && row.orderMatch.status === "RESOLVED")
    .map((row) => {
      const match = row.orderMatch as Extract<DeliveryOrderMatch, { status: "RESOLVED" }>;
      const changes = [
        { fieldPath: "sourceOrderId", proposedValue: match.orderId },
        { fieldPath: "customerId", proposedValue: match.customerId },
        ...DELIVERY_IMPORT_FIELDS.filter((field) => field !== "orderNumberRef" && row.values[field]).map((field) => ({
          fieldPath: field,
          proposedValue: row.values[field],
        })),
      ];
      return {
        propositionId: crypto.randomUUID(),
        propositionType: "delivery_spreadsheet_import",
        targetDomain: "Delivery",
        entityResolutionStatus: "NEW_ENTITY" as const,
        operation: "CREATE" as const,
        requiresApproval: true,
        provenance: { source: "spreadsheet_import", rowIndex: row.rowIndex },
        changes,
      };
    });
}
