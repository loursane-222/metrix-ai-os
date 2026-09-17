import { db } from "../../db";
import type { DocumentModel } from "../document-model";

export const INVOICE_DOCUMENT_KIND = "INVOICE";

export async function buildInvoiceDocumentModel(
  organizationId: string,
  invoiceId: string
): Promise<{ model: DocumentModel; sourceSnapshot: string } | null> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: { select: { name: true } }
    }
  });

  if (!invoice) return null;

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true }
  });

  if (!organization) return null;

  const meta = [
    { label: "Başlık", value: invoice.title },
    { label: "Durum", value: invoice.status },
    { label: "Ara Toplam", value: `${Number(invoice.amount).toFixed(2)} ${invoice.currency}` },
    { label: "Vergi Tutarı", value: `${Number(invoice.taxAmount).toFixed(2)} ${invoice.currency}` }
  ];

  const model: DocumentModel = {
    kind: INVOICE_DOCUMENT_KIND,
    documentTitle: "Fatura",
    documentNumber: invoice.invoiceNumber,
    organizationName: organization.name,
    customerName: invoice.customer.name,
    issuedAt: invoice.createdAt.toISOString(),
    currency: invoice.currency,
    lines: invoice.items.map(item => ({
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents.toString(),
      vatRateBasisPoints: item.vatRateBasisPoints,
      lineTotalCents: item.lineTotalCents.toString()
    })),
    totalCents: String(BigInt(Math.round(Number(invoice.totalAmount) * 100))),
    meta,
    notes: invoice.notes
  };

  const sourceSnapshot = JSON.stringify({
    sourceType: "Invoice",
    id: invoice.id,
    organizationId,
    customerId: invoice.customerId,
    sourceOrderId: invoice.sourceOrderId,
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    customerName: invoice.customer.name,
    amount: Number(invoice.amount),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    currency: invoice.currency,
    status: invoice.status,
    notes: invoice.notes,
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map(item => ({
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
