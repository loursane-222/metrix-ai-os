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

const MAX_RESULTS = 50;

export type CollectionEventReality = {
  settlementId: string;
  kind: "ORIGINAL" | "REVERSAL";
  direction: "IN" | "OUT";
  amount: number;
  currency: string;
  occurredAt: string;
};

export type CollectionLedgerReality = {
  invoiceId: string;
  paymentId: string | null;
  currency: string;
  receivableAmount: number;
  totalCollected: number;
  outstanding: number;
  collectionState: CollectionState;
  collections: CollectionEventReality[];
};

/**
 * Individual collection events are read from Settlement — the real
 * customer collection event authority — while totals are always derived
 * from the Application aggregate, the same canonical formula
 * collection-record and invoice-receivable-lookup use.
 */
export async function listCollectionsForInvoice(
  input: {
    actorUserId: string;
    organizationId: string;
    invoiceId: string;
  }
): Promise<CollectionLedgerReality> {
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

  if (!payment) {
    return {
      invoiceId: invoice.id,
      paymentId: null,
      currency: invoice.currency,
      receivableAmount: Number(invoice.totalAmount),
      totalCollected: 0,
      outstanding: Number(invoice.totalAmount),
      collectionState: "UNPAID",
      collections: []
    };
  }

  const [applications, settlements] = await Promise.all([
    db.application.findMany({
      where: { organizationId, paymentId: payment.id },
      select: { amount: true, kind: true }
    }),
    db.settlement.findMany({
      where: { organizationId, paymentId: payment.id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: MAX_RESULTS,
      select: {
        id: true,
        kind: true,
        direction: true,
        amount: true,
        currency: true,
        occurredAt: true
      }
    })
  ]);

  const receivableAmountCents = amountToCents(Number(payment.amount));
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
    paymentId: payment.id,
    currency: payment.currency,
    receivableAmount: centsToAmount(receivableAmountCents),
    totalCollected: centsToAmount(netCollectedCents),
    outstanding: centsToAmount(outstandingCents),
    collectionState,
    collections: settlements.map(settlement => ({
      settlementId: settlement.id,
      kind: settlement.kind,
      direction: settlement.direction,
      amount: Number(settlement.amount),
      currency: settlement.currency,
      occurredAt: settlement.occurredAt.toISOString()
    }))
  };
}
