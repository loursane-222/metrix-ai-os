import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";
import {
  computeLineTotalCents,
  computeQuoteTotalCents,
  centsToAmount
} from "../commercial/quote-totals";

import {
  InvalidQuoteItemError,
  ProductServiceNotFoundError
} from "./quote-create";

const QuoteUpdateItemInputSchema = z.object({
  productServiceId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(50).optional(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  discountBasisPoints: z.number().int().optional(),
  vatRateBasisPoints: z.number().int().optional()
});

const QuoteUpdateInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    quoteId: z.string().trim().min(1),
    expectedUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .optional(),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(5000).optional(),
    customerNote: z
      .string()
      .trim()
      .min(1)
      .max(5000)
      .optional(),
    specialTerms: z
      .string()
      .trim()
      .min(1)
      .max(5000)
      .optional(),
    validUntil: z
      .string()
      .datetime({ offset: true })
      .optional(),
    generalDiscountBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional(),
    deliveryTerm: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional(),
    deliveryMethod: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional(),
    items: z
      .array(QuoteUpdateItemInputSchema)
      .optional()
  })
  .refine(
    input =>
      input.title !== undefined ||
      input.notes !== undefined ||
      input.customerNote !== undefined ||
      input.specialTerms !== undefined ||
      input.validUntil !== undefined ||
      input.generalDiscountBasisPoints !==
        undefined ||
      input.deliveryTerm !== undefined ||
      input.deliveryMethod !== undefined ||
      input.items !== undefined,
    {
      message: "At least one mutable field is required"
    }
  );

export type QuoteUpdateInput =
  z.input<typeof QuoteUpdateInputSchema>;

type ParsedInput = z.output<
  typeof QuoteUpdateInputSchema
>;

export type VerifiedQuoteUpdateResult = {
  action: "quote.update";
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
    status: "DRAFT" | "WON";
    items: Array<{
      id: string;
      productServiceId: string | null;
      name: string;
      unit: string | null;
      quantity: number;
      unitPriceCents: string;
      discountBasisPoints: number;
      vatRateBasisPoints: number;
      lineTotalCents: string;
      sortOrder: number;
    }>;
  };
};

export class QuoteUpdateIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "QuoteUpdateIdempotencyConflictError";
  }
}

export class QuoteUpdateVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "QuoteUpdateVerificationError";
  }
}

export class QuoteNotFoundError extends Error {
  readonly code = "QUOTE_NOT_FOUND";

  constructor() {
    super(
      "Quote was not found in the authorized organization"
    );
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteVersionConflictError
  extends Error {
  readonly code = "QUOTE_VERSION_CONFLICT";

  constructor() {
    super(
      "Quote was modified since it was last read"
    );
    this.name = "QuoteVersionConflictError";
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

function assertValidLines(
  items: ParsedInput["items"]
): void {
  if (!items) {
    return;
  }

  for (const item of items) {
    if (!item.name.trim()) {
      throw new InvalidQuoteItemError(
        "item name is required"
      );
    }

    if (item.quantity <= 0) {
      throw new InvalidQuoteItemError(
        "item quantity must be positive"
      );
    }

    if (item.unitPriceCents < 0) {
      throw new InvalidQuoteItemError(
        "item unitPriceCents must not be negative"
      );
    }
  }
}

function requestHash(
  input: ParsedInput
): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    quoteId: input.quoteId,
    title: input.title ?? null,
    notes: input.notes ?? null,
    customerNote: input.customerNote ?? null,
    specialTerms: input.specialTerms ?? null,
    validUntil: input.validUntil ?? null,
    generalDiscountBasisPoints:
      input.generalDiscountBasisPoints ?? null,
    deliveryTerm: input.deliveryTerm ?? null,
    deliveryMethod: input.deliveryMethod ?? null,
    items: input.items ?? null
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

function computedLine(
  item: NonNullable<ParsedInput["items"]>[number]
) {
  const discountBasisPoints =
    item.discountBasisPoints ?? 0;

  const vatRateBasisPoints =
    item.vatRateBasisPoints ?? 0;

  const unitPriceCents = BigInt(
    Math.round(item.unitPriceCents)
  );

  const lineTotalCents = computeLineTotalCents({
    quantity: item.quantity,
    unitPriceCents,
    discountBasisPoints,
    vatRateBasisPoints
  });

  return {
    productServiceId:
      item.productServiceId ?? null,
    name: item.name,
    unit: item.unit ?? null,
    quantity: item.quantity,
    unitPriceCents,
    discountBasisPoints,
    vatRateBasisPoints,
    lineTotalCents
  };
}

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedQuoteUpdateResult> {
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
      status: true,
      notes: true,
      customerNote: true,
      specialTerms: true,
      validUntil: true,
      generalDiscountBasisPoints: true,
      deliveryTerm: true,
      deliveryMethod: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          productServiceId: true,
          name: true,
          unit: true,
          quantity: true,
          unitPriceCents: true,
          discountBasisPoints: true,
          vatRateBasisPoints: true,
          lineTotalCents: true,
          sortOrder: true
        }
      }
    }
  });

  if (
    !quote ||
    quote.organizationId !== input.organizationId
  ) {
    throw new QuoteUpdateVerificationError();
  }

  if (
    (input.title !== undefined &&
      quote.title !== input.title) ||
    (input.notes !== undefined &&
      quote.notes !== input.notes) ||
    (input.customerNote !== undefined &&
      quote.customerNote !== input.customerNote) ||
    (input.specialTerms !== undefined &&
      quote.specialTerms !== input.specialTerms) ||
    (input.deliveryTerm !== undefined &&
      quote.deliveryTerm !== input.deliveryTerm) ||
    (input.deliveryMethod !== undefined &&
      quote.deliveryMethod !==
        input.deliveryMethod) ||
    (input.generalDiscountBasisPoints !==
      undefined &&
      quote.generalDiscountBasisPoints !==
        input.generalDiscountBasisPoints) ||
    (input.validUntil !== undefined &&
      quote.validUntil?.toISOString() !==
        new Date(
          input.validUntil
        ).toISOString())
  ) {
    throw new QuoteUpdateVerificationError();
  }

  if (input.items !== undefined) {
    const expectedItems = input.items;

    if (quote.items.length !== expectedItems.length) {
      throw new QuoteUpdateVerificationError();
    }

    for (
      let i = 0;
      i < expectedItems.length;
      i += 1
    ) {
      const persistedItem = quote.items[i];
      const expected = computedLine(
        expectedItems[i]
      );

      if (
        !persistedItem ||
        persistedItem.name !== expected.name ||
        Number(persistedItem.quantity) !==
          expected.quantity ||
        persistedItem.unitPriceCents !==
          expected.unitPriceCents ||
        persistedItem.lineTotalCents !==
          expected.lineTotalCents
      ) {
        throw new QuoteUpdateVerificationError();
      }
    }
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "quote.update",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "quote.update",
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
      status: quote.status,
      items: quote.items.map(item => ({
        id: item.id,
        productServiceId: item.productServiceId,
        name: item.name,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPriceCents:
          item.unitPriceCents.toString(),
        discountBasisPoints:
          item.discountBasisPoints,
        vatRateBasisPoints:
          item.vatRateBasisPoints,
        lineTotalCents:
          item.lineTotalCents.toString(),
        sortOrder: item.sortOrder
      }))
    }
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedQuoteUpdateResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "quote.update",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new QuoteUpdateIdempotencyConflictError();
  }

  return readbackAndVerify(input, true);
}

export async function executeQuoteUpdate(
  rawInput: QuoteUpdateInput
): Promise<VerifiedQuoteUpdateResult> {
  const input =
    QuoteUpdateInputSchema.parse(rawInput);

  assertValidLines(input.items);

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
                actionType: "quote.update",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new QuoteUpdateIdempotencyConflictError();
          }

          return { replayed: true };
        }

        const target = await tx.quote.findFirst({
          where: {
            id: input.quoteId,
            organizationId: input.organizationId
          },
          select: { id: true, updatedAt: true }
        });

        if (!target) {
          throw new QuoteNotFoundError();
        }

        if (
          input.expectedUpdatedAt !== undefined &&
          target.updatedAt.getTime() !==
            new Date(
              input.expectedUpdatedAt
            ).getTime()
        ) {
          throw new QuoteVersionConflictError();
        }

        if (input.items !== undefined) {
          const requestedProductIds = Array.from(
            new Set(
              input.items
                .map(item => item.productServiceId)
                .filter(
                  (id): id is string =>
                    id !== undefined
                )
            )
          );

          if (requestedProductIds.length > 0) {
            const foundProducts =
              await tx.productService.findMany({
                where: {
                  id: { in: requestedProductIds },
                  organizationId:
                    input.organizationId
                },
                select: { id: true }
              });

            if (
              foundProducts.length !==
              requestedProductIds.length
            ) {
              throw new ProductServiceNotFoundError();
            }
          }
        }

        const shouldRecomputeTotal =
          input.items !== undefined ||
          input.generalDiscountBasisPoints !==
            undefined;

        if (input.items !== undefined) {
          await tx.quoteItem.deleteMany({
            where: {
              quoteId: input.quoteId,
              organizationId:
                input.organizationId
            }
          });

          const computedLines =
            input.items.map(computedLine);

          for (
            let index = 0;
            index < computedLines.length;
            index += 1
          ) {
            const line = computedLines[index];

            await tx.quoteItem.create({
              data: {
                organizationId:
                  input.organizationId,
                quoteId: input.quoteId,
                productServiceId:
                  line.productServiceId,
                name: line.name,
                unit: line.unit,
                quantity: line.quantity,
                unitPriceCents:
                  line.unitPriceCents,
                discountBasisPoints:
                  line.discountBasisPoints,
                vatRateBasisPoints:
                  line.vatRateBasisPoints,
                lineTotalCents:
                  line.lineTotalCents,
                sortOrder: index
              }
            });
          }
        }

        let amount: number | undefined;

        if (shouldRecomputeTotal) {
          const currentItems =
            await tx.quoteItem.findMany({
              where: {
                quoteId: input.quoteId,
                organizationId:
                  input.organizationId
              },
              select: { lineTotalCents: true }
            });

          const generalDiscountBasisPoints =
            input.generalDiscountBasisPoints !==
            undefined
              ? input.generalDiscountBasisPoints
              : (
                  await tx.quote.findFirst({
                    where: {
                      id: input.quoteId,
                      organizationId:
                        input.organizationId
                    },
                    select: {
                      generalDiscountBasisPoints: true
                    }
                  })
                )?.generalDiscountBasisPoints ??
                null;

          amount = centsToAmount(
            computeQuoteTotalCents(
              currentItems.map(
                item => item.lineTotalCents
              ),
              generalDiscountBasisPoints
            )
          );
        }

        await tx.quote.updateMany({
          where: {
            id: input.quoteId,
            organizationId: input.organizationId
          },
          data: {
            ...(input.title !== undefined
              ? { title: input.title }
              : {}),
            ...(input.notes !== undefined
              ? { notes: input.notes }
              : {}),
            ...(input.customerNote !== undefined
              ? { customerNote: input.customerNote }
              : {}),
            ...(input.specialTerms !== undefined
              ? { specialTerms: input.specialTerms }
              : {}),
            ...(input.validUntil !== undefined
              ? {
                  validUntil: new Date(
                    input.validUntil
                  )
                }
              : {}),
            ...(input.generalDiscountBasisPoints !==
            undefined
              ? {
                  generalDiscountBasisPoints:
                    input.generalDiscountBasisPoints
                }
              : {}),
            ...(input.deliveryTerm !== undefined
              ? { deliveryTerm: input.deliveryTerm }
              : {}),
            ...(input.deliveryMethod !== undefined
              ? {
                  deliveryMethod:
                    input.deliveryMethod
                }
              : {}),
            ...(amount !== undefined
              ? { amount }
              : {})
          }
        });

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType: "quote.update",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Quote",
            resourceId: input.quoteId,
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
      error instanceof QuoteUpdateIdempotencyConflictError ||
      error instanceof QuoteNotFoundError ||
      error instanceof QuoteVersionConflictError ||
      error instanceof ProductServiceNotFoundError ||
      error instanceof InvalidQuoteItemError
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
