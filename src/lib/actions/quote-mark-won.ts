import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

import {
  QuoteNotFoundError
} from "./quote-update";

export { QuoteNotFoundError } from "./quote-update";

const QuoteMarkWonInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  quoteId: z.string().trim().min(1)
});

export type QuoteMarkWonInput =
  z.input<typeof QuoteMarkWonInputSchema>;

type ParsedInput = z.output<
  typeof QuoteMarkWonInputSchema
>;

export type VerifiedQuoteMarkWonResult = {
  action: "quote.mark_won";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  quote: {
    id: string;
    customerId: string;
    customerName: string;
    title: string;
    amount: number | null;
    currency: string;
    status: "WON";
  };
};

export class QuoteMarkWonIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "QuoteMarkWonIdempotencyConflictError";
  }
}

export class QuoteMarkWonVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "QuoteMarkWonVerificationError";
  }
}

function isUniqueConflict(
  error: unknown
): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return false;
  }

  return (
    (error as { code?: string }).code === "P2002"
  );
}

function requestHash(
  input: ParsedInput
): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    quoteId: input.quoteId
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedQuoteMarkWonResult> {
  const quote = await db.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      customerName: true,
      title: true,
      amount: true,
      currency: true,
      status: true
    }
  });

  if (
    !quote ||
    quote.organizationId !== input.organizationId ||
    quote.status !== "WON"
  ) {
    throw new QuoteMarkWonVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "quote.mark_won",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "quote.mark_won",
    status: "VERIFIED",
    verified: true,
    replayed,
    quote: {
      id: quote.id,
      customerId: quote.customerId,
      customerName: quote.customerName,
      title: quote.title,
      amount:
        quote.amount === null
          ? null
          : Number(quote.amount),
      currency: quote.currency,
      status: "WON"
    }
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedQuoteMarkWonResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "quote.mark_won",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new QuoteMarkWonIdempotencyConflictError();
  }

  return readbackAndVerify(input, true);
}

export async function executeQuoteMarkWon(
  rawInput: QuoteMarkWonInput
): Promise<VerifiedQuoteMarkWonResult> {
  const input =
    QuoteMarkWonInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);

  const existing =
    await resolveExisting(input, hash);

  if (existing) {
    return existing;
  }

  try {
    const outcome =
      await db.$transaction(async (tx) => {
        const raceCheck =
          await tx.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId:
                  input.organizationId,
                actionType: "quote.mark_won",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new QuoteMarkWonIdempotencyConflictError();
          }

          return { replayed: true };
        }

        const target = await tx.quote.findFirst({
          where: {
            id: input.quoteId,
            organizationId: input.organizationId
          },
          select: { id: true, status: true }
        });

        if (!target) {
          throw new QuoteNotFoundError();
        }

        if (target.status !== "WON") {
          await tx.quote.update({
            where: { id: target.id },
            data: { status: "WON" }
          });
        }

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType: "quote.mark_won",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Quote",
            resourceId: target.id,
            status: "PENDING"
          }
        });

        return { replayed: false };
      });

    if (outcome.replayed) {
      return readbackAndVerify(input, true);
    }
  } catch (error) {
    if (
      error instanceof QuoteMarkWonIdempotencyConflictError ||
      error instanceof QuoteNotFoundError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced =
      await resolveExisting(input, hash);

    if (!raced) {
      throw error;
    }

    return raced;
  }

  return readbackAndVerify(input, false);
}
