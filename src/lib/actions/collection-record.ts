import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";
import {
  amountToCents,
  centsToAmount,
  isValidTwoDecimalAmount
} from "../commercial/quote-totals";
import {
  computeNetCollectedCents,
  computeOutstandingCents,
  deriveCollectionState
} from "../commercial/receivable";

import type { CollectionState } from "../commercial/receivable";

const CollectionRecordInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  invoiceId: z.string().trim().min(1),
  amount: z
    .number()
    .positive()
    .refine(isValidTwoDecimalAmount, {
      message: "amount must have at most 2 decimal places"
    }),
  occurredAt: z.string().datetime({ offset: true }).optional()
});

export type CollectionRecordInput =
  z.input<typeof CollectionRecordInputSchema>;

type ParsedInput = z.output<
  typeof CollectionRecordInputSchema
>;

export type VerifiedCollectionRecordResult = {
  action: "collection.record";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  collection: {
    settlementId: string;
    applicationId: string;
    invoiceId: string;
    paymentId: string;
    customerId: string;
    amount: number;
    currency: string;
    occurredAt: string;
    receivableAmount: number;
    collected: number;
    outstanding: number;
    collectionState: CollectionState;
  };
};

export class CollectionIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "CollectionIdempotencyConflictError";
  }
}

export class CollectionVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "CollectionVerificationError";
  }
}

export class InvoiceNotFoundError extends Error {
  readonly code = "INVOICE_NOT_FOUND";

  constructor() {
    super(
      "Invoice was not found in the authorized organization"
    );
    this.name = "InvoiceNotFoundError";
  }
}

export class CollectionExceedsOutstandingError extends Error {
  readonly code = "COLLECTION_EXCEEDS_OUTSTANDING";

  constructor() {
    super(
      "Requested collection amount exceeds the invoice's outstanding balance"
    );
    this.name = "CollectionExceedsOutstandingError";
  }
}

export class CollectionCurrencyMismatchError extends Error {
  readonly code = "COLLECTION_CURRENCY_MISMATCH";

  constructor() {
    super(
      "Payment currency is inconsistent with the invoice/settlement currency"
    );
    this.name = "CollectionCurrencyMismatchError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return false;
  }

  return (error as { code?: string }).code === "P2002";
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    invoiceId: input.invoiceId,
    amountCents: amountToCents(input.amount).toString(),
    occurredAt: input.occurredAt ?? null
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

async function readbackAndVerify(
  input: ParsedInput,
  settlementId: string,
  replayed: boolean
): Promise<VerifiedCollectionRecordResult> {
  const settlement = await db.settlement.findFirst({
    where: {
      id: settlementId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      paymentId: true,
      kind: true,
      direction: true,
      amount: true,
      currency: true,
      occurredAt: true
    }
  });

  if (!settlement || settlement.kind !== "ORIGINAL" || settlement.direction !== "IN") {
    throw new CollectionVerificationError();
  }

  const application = await db.application.findFirst({
    where: {
      organizationId: input.organizationId,
      settlementId: settlement.id
    },
    select: {
      id: true,
      paymentId: true,
      kind: true,
      amount: true,
      currency: true,
      appliedAt: true
    }
  });

  if (
    !application ||
    application.kind !== "ORIGINAL" ||
    application.paymentId !== settlement.paymentId
  ) {
    throw new CollectionVerificationError();
  }

  const payment = await db.payment.findFirst({
    where: {
      id: settlement.paymentId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      invoiceId: true,
      customerId: true,
      amount: true,
      currency: true,
      paidAmount: true,
      paidAt: true
    }
  });

  if (!payment || payment.invoiceId !== input.invoiceId) {
    throw new CollectionVerificationError();
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id: input.invoiceId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      customerId: true,
      totalAmount: true,
      currency: true
    }
  });

  if (
    !invoice ||
    invoice.customerId !== payment.customerId ||
    Number(invoice.totalAmount) !== Number(payment.amount) ||
    invoice.currency !== payment.currency ||
    payment.currency !== settlement.currency ||
    settlement.currency !== application.currency
  ) {
    throw new CollectionVerificationError();
  }

  const requestedCents = amountToCents(input.amount);

  if (
    amountToCents(Number(settlement.amount)) !== requestedCents ||
    amountToCents(Number(application.amount)) !== requestedCents
  ) {
    throw new CollectionVerificationError();
  }

  if (
    input.occurredAt &&
    settlement.occurredAt.toISOString() !==
      new Date(input.occurredAt).toISOString()
  ) {
    throw new CollectionVerificationError();
  }

  const allApplications = await db.application.findMany({
    where: {
      organizationId: input.organizationId,
      paymentId: payment.id
    },
    select: { amount: true, kind: true }
  });

  const paymentAmountCents = amountToCents(Number(payment.amount));
  const netCollectedCents = computeNetCollectedCents(allApplications);
  const outstandingCents = computeOutstandingCents(
    paymentAmountCents,
    netCollectedCents
  );
  const collectionState = deriveCollectionState(
    netCollectedCents,
    outstandingCents
  );

  if (outstandingCents < BigInt(0)) {
    throw new CollectionVerificationError();
  }

  if (
    amountToCents(Number(payment.paidAmount)) !== netCollectedCents
  ) {
    throw new CollectionVerificationError();
  }

  if (collectionState === "PAID" && outstandingCents !== BigInt(0)) {
    throw new CollectionVerificationError();
  }

  if (
    collectionState === "PARTIAL" &&
    (outstandingCents <= BigInt(0) || outstandingCents >= paymentAmountCents)
  ) {
    throw new CollectionVerificationError();
  }

  if (collectionState === "PAID" && payment.paidAt === null) {
    throw new CollectionVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "collection.record",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "collection.record",
    status: "VERIFIED",
    verified: true,
    replayed,
    collection: {
      settlementId: settlement.id,
      applicationId: application.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      customerId: payment.customerId,
      amount: Number(settlement.amount),
      currency: settlement.currency,
      occurredAt: settlement.occurredAt.toISOString(),
      receivableAmount: centsToAmount(paymentAmountCents),
      collected: centsToAmount(netCollectedCents),
      outstanding: centsToAmount(outstandingCents),
      collectionState
    }
  };
}

async function resolveExistingByActionExecution(
  input: ParsedInput,
  hash: string
): Promise<VerifiedCollectionRecordResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "collection.record",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new CollectionIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeCollectionRecord(
  rawInput: CollectionRecordInput
): Promise<VerifiedCollectionRecordResult> {
  const input = CollectionRecordInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);

  const existing = await resolveExistingByActionExecution(
    input,
    hash
  );

  if (existing) {
    return existing;
  }

  const requestedCents = amountToCents(input.amount);
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date();

  let settlementId: string;
  let replayed: boolean;

  try {
    const outcome = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "collection.record",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new CollectionIdempotencyConflictError();
        }

        return {
          settlementId: raceCheck.resourceId,
          replayed: true
        };
      }

      // Serialize every collection_record call for this Invoice on a
      // single row lock, the same technique Task 16 uses for Order ->
      // Invoice materialization. This is the ONLY lock we need: the
      // derived Payment is found-or-materialized, its outstanding is
      // recomputed, and the new Settlement/Application are written, all
      // while this lock is held — so two concurrent calls against the
      // same Invoice fully serialize and can never both succeed when
      // their combined amount would overcollect.
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

      if (locked.length === 0) {
        throw new InvoiceNotFoundError();
      }

      const invoice = await tx.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: input.organizationId
        },
        select: {
          id: true,
          customerId: true,
          title: true,
          totalAmount: true,
          currency: true
        }
      });

      if (!invoice) {
        throw new InvoiceNotFoundError();
      }

      let payment = await tx.payment.findFirst({
        where: {
          organizationId: input.organizationId,
          invoiceId: invoice.id
        }
      });

      if (!payment) {
        payment = await tx.payment.create({
          data: {
            organizationId: input.organizationId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            title: invoice.title,
            amount: invoice.totalAmount,
            currency: invoice.currency,
            paidAmount: 0
          }
        });
      }

      if (
        payment.currency !== invoice.currency ||
        Number(payment.amount) !== Number(invoice.totalAmount)
      ) {
        throw new CollectionCurrencyMismatchError();
      }

      const existingApplications = await tx.application.findMany({
        where: {
          organizationId: input.organizationId,
          paymentId: payment.id
        },
        select: { amount: true, kind: true }
      });

      const paymentAmountCents = amountToCents(
        Number(payment.amount)
      );
      const netCollectedCents = computeNetCollectedCents(
        existingApplications
      );
      const outstandingCents = computeOutstandingCents(
        paymentAmountCents,
        netCollectedCents
      );

      if (requestedCents > outstandingCents) {
        throw new CollectionExceedsOutstandingError();
      }

      const settlement = await tx.settlement.create({
        data: {
          organizationId: input.organizationId,
          paymentId: payment.id,
          kind: "ORIGINAL",
          direction: "IN",
          amount: centsToAmount(requestedCents),
          currency: payment.currency,
          occurredAt,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          actorUserId: input.actorUserId
        }
      });

      await tx.application.create({
        data: {
          organizationId: input.organizationId,
          settlementId: settlement.id,
          paymentId: payment.id,
          kind: "ORIGINAL",
          amount: centsToAmount(requestedCents),
          currency: payment.currency,
          appliedAt: occurredAt
        }
      });

      const newNetCollectedCents = netCollectedCents + requestedCents;
      const newOutstandingCents = computeOutstandingCents(
        paymentAmountCents,
        newNetCollectedCents
      );

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          paidAmount: centsToAmount(newNetCollectedCents),
          ...(newOutstandingCents === BigInt(0)
            ? { paidAt: occurredAt }
            : {})
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "collection.record",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Settlement",
          resourceId: settlement.id,
          status: "PENDING"
        }
      });

      return {
        settlementId: settlement.id,
        replayed: false
      };
    });

    settlementId = outcome.settlementId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof CollectionIdempotencyConflictError ||
      error instanceof InvoiceNotFoundError ||
      error instanceof CollectionExceedsOutstandingError ||
      error instanceof CollectionCurrencyMismatchError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced = await resolveExistingByActionExecution(
      input,
      hash
    );

    if (raced) {
      return raced;
    }

    throw error;
  }

  return readbackAndVerify(input, settlementId, replayed);
}
