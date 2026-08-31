import { prisma } from "@/lib/core/shared/prisma";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { resolveSupplierReference } from "@/lib/suppliers/supplier-resolution";
import type { SupplierRecord } from "@/lib/suppliers/suppliers-client";

// Deliberately NOT routed through the heavier universal-capture
// EntityResolutionProvider/orchestrator machinery (contracts.ts) — that
// system exists for incremental, multi-turn field capture merged against an
// existing in-progress draft, which has no analog here: a single document
// produces one, fully-fresh set of candidates in one shot. Calling the
// SAME proven matching functions the text-capture flows already use
// (resolveCustomerReference / resolveSupplierReference) directly gives
// identical match quality with far less integration surface.
export type CounterpartyResolution =
  | { status: "RESOLVED"; kind: "CUSTOMER"; id: string; name: string }
  | { status: "RESOLVED"; kind: "SUPPLIER"; id: string; name: string }
  | { status: "AMBIGUOUS"; candidateNames: readonly string[] }
  | { status: "NOT_FOUND" }
  | { status: "NO_EVIDENCE" };

export async function resolveCounterpartyForDocument(
  organizationId: string,
  kind: "CUSTOMER" | "SUPPLIER",
  nameEvidence: string | null | undefined,
): Promise<CounterpartyResolution> {
  const reference = nameEvidence?.trim();
  if (!reference) return { status: "NO_EVIDENCE" };

  if (kind === "CUSTOMER") {
    const rows = await prisma.customer.findMany({
      where: { organizationId, status: { not: "BLOCKED" } },
      select: { id: true, displayName: true, legalName: true, phone: true, email: true, cariKodu: true, taxNumber: true },
    });
    const resolution = resolveCustomerReference(rows, reference);
    if (resolution.status === "RESOLVED") return { status: "RESOLVED", kind: "CUSTOMER", id: resolution.customer.id, name: resolution.customer.displayName };
    if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS", candidateNames: resolution.options.map((option) => option.displayName) };
    return { status: "NOT_FOUND" };
  }

  const rows = await prisma.supplier.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, displayName: true, legalName: true, phone: true, email: true, website: true, taxNumber: true, taxOffice: true, metrixNote: true, riskNotes: true, status: true, score: true, updatedAt: true },
  });
  const asSupplierRecords: SupplierRecord[] = rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  const resolution = resolveSupplierReference(asSupplierRecords, reference);
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", kind: "SUPPLIER", id: resolution.supplier.id, name: resolution.supplier.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS", candidateNames: resolution.options.map((option) => option.displayName) };
  return { status: "NOT_FOUND" };
}

export type PurchaseOrderResolution =
  | { status: "RESOLVED"; purchaseOrderId: string }
  | { status: "AMBIGUOUS" }
  | { status: "NOT_FOUND" }
  | { status: "NO_EVIDENCE" };

// Fail-closed by construction: purchaseInvoice.createFromPurchaseOrder
// requires an existing purchaseOrderId (there is no "create a standalone
// purchase invoice" action) — if the document doesn't carry a resolvable PO
// number, or the supplier+number pair doesn't match exactly one open PO,
// this returns NOT_FOUND/AMBIGUOUS and the caller must send the candidate
// to review without a resolved target rather than guessing.
export async function resolvePurchaseOrderForDocument(
  organizationId: string,
  supplierId: string | null,
  poNumberEvidence: string | null | undefined,
): Promise<PurchaseOrderResolution> {
  const reference = poNumberEvidence?.trim();
  if (!reference || !supplierId) return { status: "NO_EVIDENCE" };
  const matches = await prisma.purchaseOrder.findMany({
    where: { organizationId, supplierId, poNumber: { equals: reference, mode: "insensitive" } },
    select: { id: true },
  });
  if (matches.length === 1) return { status: "RESOLVED", purchaseOrderId: matches[0]!.id };
  if (matches.length > 1) return { status: "AMBIGUOUS" };
  return { status: "NOT_FOUND" };
}
