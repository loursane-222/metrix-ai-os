import { db } from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import {
  InvoiceNotFoundError
} from "../actions/collection-record";
import {
  amountToCents,
  centsToAmount
} from "../commercial/quote-totals";
import {
  computeNetCollectedCents,
  computeOutstandingCents,
  deriveCollectionState
} from "../commercial/receivable";

import type { CollectionState } from "../commercial/receivable";

export { InvoiceNotFoundError } from "../actions/collection-record";

export type InvoiceReceivableReality = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  currency: string;
  invoiceTotalAmount: number;
  paymentId: string | null;
  receivableAmount: number;
  collected: number;
  outstanding: number;
  collectionState: CollectionState;
};

/**
 * Pure read: this tool never materializes a Payment. When no Payment has
 * been created yet (collection_record has never run for this Invoice), the
 * receivable is derived directly from the Invoice's own persisted truth —
 * collected is 0 and outstanding is the full invoice total.
 */
export async function lookupInvoiceReceivable(
  input: {
    actorUserId: string;
    organizationId: string;
    invoiceId: string;
  }
): Promise<InvoiceReceivableReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const invoiceId = input.invoiceId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId
    },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      currency: true,
      totalAmount: true
    }
  });

  if (!invoice) {
    throw new InvoiceNotFoundError();
  }

  const payment = await db.payment.findFirst({
    where: {
      organizationId,
      invoiceId: invoice.id
    },
    select: {
      id: true,
      amount: true,
      currency: true
    }
  });

  const receivableAmountCents = payment
    ? amountToCents(Number(payment.amount))
    : amountToCents(Number(invoice.totalAmount));

  const applications = payment
    ? await db.application.findMany({
        where: {
          organizationId,
          paymentId: payment.id
        },
        select: { amount: true, kind: true }
      })
    : [];

  const netCollectedCents = computeNetCollectedCents(applications);
  const outstandingCents = computeOutstandingCents(
    receivableAmountCents,
    netCollectedCents
  );
  const collectionState = deriveCollectionState(
    netCollectedCents,
    outstandingCents
  );

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    currency: payment?.currency ?? invoice.currency,
    invoiceTotalAmount: Number(invoice.totalAmount),
    paymentId: payment?.id ?? null,
    receivableAmount: centsToAmount(receivableAmountCents),
    collected: centsToAmount(netCollectedCents),
    outstanding: centsToAmount(outstandingCents),
    collectionState
  };
}
