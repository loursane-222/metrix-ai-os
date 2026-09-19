import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";
import { amountToCents, centsToAmount } from "../commercial/quote-totals";
import {
  computeNetCollectedCents,
  computeOutstandingCents,
  deriveCollectionState
} from "../commercial/receivable";

import type { CollectionState } from "../commercial/receivable";

export type OutstandingInvoiceReality = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  currency: string;
  outstanding: number;
  collectionState: CollectionState;
  daysOutstanding: number;
  createdAt: string;
};

export type ReceivablesByCurrency = {
  currency: string;
  invoiceCount: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
};

export type ReceivablesSummaryReality = {
  referenceTimeIso: string;
  byCurrency: ReceivablesByCurrency[];
  outstandingInvoices: OutstandingInvoiceReality[];
};

const MAX_OUTSTANDING_ROWS = 20;

/**
 * Org-wide deterministic aggregate over the same Invoice -> Payment ->
 * Application ledger invoice-receivable-lookup already reads per-invoice
 * (see ../commercial/receivable.ts) — this is the only place that sums it
 * across every invoice in the organization. No new money math: every
 * outstanding/collected figure here is produced by the same shared
 * formula, just applied to the whole portfolio instead of one invoice.
 */
export async function lookupReceivablesSummary(
  input: {
    actorUserId: string;
    organizationId: string;
    referenceTimeIso?: string;
  }
): Promise<ReceivablesSummaryReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const referenceTimeIso =
    input.referenceTimeIso ?? new Date().toISOString();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const invoices = await db.invoice.findMany({
    where: { organizationId },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      currency: true,
      totalAmount: true,
      createdAt: true,
      customer: { select: { name: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  if (invoices.length === 0) {
    return { referenceTimeIso, byCurrency: [], outstandingInvoices: [] };
  }

  const invoiceIds = invoices.map(invoice => invoice.id);

  const payments = await db.payment.findMany({
    where: { organizationId, invoiceId: { in: invoiceIds } },
    select: { id: true, invoiceId: true, amount: true, currency: true }
  });

  const paymentByInvoiceId = new Map(
    payments.map(payment => [payment.invoiceId, payment])
  );

  const paymentIds = payments.map(payment => payment.id);

  const applications = paymentIds.length
    ? await db.application.findMany({
        where: { organizationId, paymentId: { in: paymentIds } },
        select: { paymentId: true, amount: true, kind: true }
      })
    : [];

  const applicationsByPaymentId = new Map<
    string,
    { amount: unknown; kind: "ORIGINAL" | "REVERSAL" }[]
  >();

  for (const application of applications) {
    const list = applicationsByPaymentId.get(application.paymentId) ?? [];
    list.push({ amount: application.amount, kind: application.kind });
    applicationsByPaymentId.set(application.paymentId, list);
  }

  const referenceTimeMs = new Date(referenceTimeIso).getTime();

  const byCurrencyMap = new Map<string, ReceivablesByCurrency>();
  const outstandingInvoices: OutstandingInvoiceReality[] = [];

  for (const invoice of invoices) {
    const payment = paymentByInvoiceId.get(invoice.id);
    const currency = payment?.currency ?? invoice.currency;

    const receivableAmountCents = payment
      ? amountToCents(Number(payment.amount))
      : amountToCents(Number(invoice.totalAmount));

    const applicationRows = payment
      ? applicationsByPaymentId.get(payment.id) ?? []
      : [];

    const netCollectedCents = computeNetCollectedCents(applicationRows);
    const outstandingCents = computeOutstandingCents(
      receivableAmountCents,
      netCollectedCents
    );
    const collectionState = deriveCollectionState(
      netCollectedCents,
      outstandingCents
    );

    const bucket = byCurrencyMap.get(currency) ?? {
      currency,
      invoiceCount: 0,
      totalInvoiced: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      unpaidCount: 0,
      partialCount: 0,
      paidCount: 0
    };

    bucket.invoiceCount += 1;
    bucket.totalInvoiced += Number(invoice.totalAmount);
    bucket.totalCollected += centsToAmount(netCollectedCents);
    bucket.totalOutstanding += centsToAmount(outstandingCents);

    if (collectionState === "UNPAID") bucket.unpaidCount += 1;
    else if (collectionState === "PARTIAL") bucket.partialCount += 1;
    else bucket.paidCount += 1;

    byCurrencyMap.set(currency, bucket);

    if (collectionState !== "PAID") {
      const daysOutstanding = Math.max(
        0,
        Math.floor(
          (referenceTimeMs - invoice.createdAt.getTime()) / 86_400_000
        )
      );

      outstandingInvoices.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customer.name,
        currency,
        outstanding: centsToAmount(outstandingCents),
        collectionState,
        daysOutstanding,
        createdAt: invoice.createdAt.toISOString()
      });
    }
  }

  outstandingInvoices.sort((a, b) => b.outstanding - a.outstanding);

  return {
    referenceTimeIso,
    byCurrency: Array.from(byCurrencyMap.values()),
    outstandingInvoices: outstandingInvoices.slice(0, MAX_OUTSTANDING_ROWS)
  };
}
