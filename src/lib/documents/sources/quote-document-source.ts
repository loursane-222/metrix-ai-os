import { db } from "../../db";
import type { DocumentModel } from "../document-model";
import { formatDocumentDate } from "../format";

export const QUOTE_DOCUMENT_KIND = "OFFER";

export async function buildQuoteDocumentModel(
  organizationId: string,
  quoteId: string
): Promise<{ model: DocumentModel; sourceSnapshot: string } | null> {
  const quote = await db.quote.findFirst({
    where: { id: quoteId, organizationId },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });

  if (!quote) return null;

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true }
  });

  if (!organization) return null;

  const meta = [
    { label: "Durum", value: quote.status },
    quote.validUntil ? { label: "Geçerlilik Tarihi", value: formatDocumentDate(quote.validUntil.toISOString()) } : null,
    quote.deliveryTerm ? { label: "Teslim Şartı", value: quote.deliveryTerm } : null,
    quote.deliveryMethod ? { label: "Teslim Yöntemi", value: quote.deliveryMethod } : null
  ].filter((field): field is { label: string; value: string } => field !== null);

  const model: DocumentModel = {
    kind: QUOTE_DOCUMENT_KIND,
    documentTitle: "Teklif",
    documentNumber: quote.id,
    organizationName: organization.name,
    customerName: quote.customerName,
    issuedAt: quote.createdAt.toISOString(),
    currency: quote.currency,
    lines: quote.items.map(item => ({
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents.toString(),
      vatRateBasisPoints: item.vatRateBasisPoints,
      lineTotalCents: item.lineTotalCents.toString()
    })),
    totalCents: String(BigInt(Math.round(Number(quote.amount ?? 0) * 100))),
    meta,
    notes: quote.notes ?? quote.customerNote ?? null
  };

  const sourceSnapshot = JSON.stringify({
    sourceType: "Quote",
    id: quote.id,
    organizationId,
    customerId: quote.customerId,
    customerName: quote.customerName,
    title: quote.title,
    amount: quote.amount === null ? null : Number(quote.amount),
    currency: quote.currency,
    status: quote.status,
    notes: quote.notes,
    customerNote: quote.customerNote,
    validUntil: quote.validUntil?.toISOString() ?? null,
    deliveryTerm: quote.deliveryTerm,
    deliveryMethod: quote.deliveryMethod,
    updatedAt: quote.updatedAt.toISOString(),
    items: quote.items.map(item => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents.toString(),
      vatRateBasisPoints: item.vatRateBasisPoints,
      lineTotalCents: item.lineTotalCents.toString()
    })),
    organizationName: organization.name
  });

  return { model, sourceSnapshot };
}
