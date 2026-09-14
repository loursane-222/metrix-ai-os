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

const QuoteCreateItemInputSchema = z.object({
  productServiceId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(50).optional(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  discountBasisPoints: z.number().int().optional(),
  vatRateBasisPoints: z.number().int().optional()
});

const QuoteCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  customerId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
  customerNote: z.string().trim().min(1).max(5000).optional(),
  specialTerms: z.string().trim().min(1).max(5000).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  generalDiscountBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional(),
  deliveryTerm: z.string().trim().min(1).max(500).optional(),
  deliveryMethod: z.string().trim().min(1).max(500).optional(),
  amount: z.number().nonnegative().optional(),
  items: z.array(QuoteCreateItemInputSchema).optional()
});

export type QuoteCreateInput =
  z.input<typeof QuoteCreateInputSchema>;

type ParsedInput = z.output<
  typeof QuoteCreateInputSchema
>;

export type VerifiedQuoteItemResult = {
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
};

export type VerifiedQuoteCreateResult = {
  action: "quote.create";
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
    status: "DRAFT";
    items: VerifiedQuoteItemResult[];
  };
};

export class QuoteCreateIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "QuoteCreateIdempotencyConflictError";
  }
}

export class QuoteCreateVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "QuoteCreateVerificationError";
  }
}

export class CustomerNotFoundError
  extends Error {
  readonly code = "CUSTOMER_NOT_FOUND";

  constructor() {
    super(
      "Customer was not found in the authorized organization"
    );
    this.name = "CustomerNotFoundError";
  }
}

export class ProductServiceNotFoundError
  extends Error {
  readonly code = "PRODUCT_SERVICE_NOT_FOUND";

  constructor() {
    super(
      "Product/service was not found in the authorized organization"
    );
    this.name = "ProductServiceNotFoundError";
  }
}

export class InvalidQuoteItemError
  extends Error {
  readonly code = "INVALID_QUOTE_ITEM";

  constructor(message: string) {
    super(message);
    this.name = "InvalidQuoteItemError";
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
    customerId: input.customerId,
    title: input.title,
    currency: input.currency ?? null,
    notes: input.notes ?? null,
    customerNote: input.customerNote ?? null,
    specialTerms: input.specialTerms ?? null,
    validUntil: input.validUntil ?? null,
    generalDiscountBasisPoints:
      input.generalDiscountBasisPoints ?? null,
    deliveryTerm: input.deliveryTerm ?? null,
    deliveryMethod: input.deliveryMethod ?? null,
    amount: input.amount ?? null,
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
  quoteId: string,
  replayed: boolean
): Promise<VerifiedQuoteCreateResult> {
  const quote = await db.quote.findFirst({
    where: {
      id: quoteId,
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
    quote.organizationId !== input.organizationId ||
    quote.customerId !== input.customerId ||
    quote.title !== input.title
  ) {
    throw new QuoteCreateVerificationError();
  }

  const expectedItems = input.items ?? [];

  if (quote.items.length !== expectedItems.length) {
    throw new QuoteCreateVerificationError();
  }

  for (let i = 0; i < expectedItems.length; i += 1) {
    const persistedItem = quote.items[i];
    const expected = computedLine(expectedItems[i]);

    if (
      !persistedItem ||
      persistedItem.name !== expected.name ||
      Number(persistedItem.quantity) !==
        expected.quantity ||
      persistedItem.unitPriceCents !==
        expected.unitPriceCents ||
      persistedItem.discountBasisPoints !==
        expected.discountBasisPoints ||
      persistedItem.vatRateBasisPoints !==
        expected.vatRateBasisPoints ||
      persistedItem.lineTotalCents !==
        expected.lineTotalCents
    ) {
      throw new QuoteCreateVerificationError();
    }
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "quote.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "quote.create",
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
): Promise<VerifiedQuoteCreateResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "quote.create",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new QuoteCreateIdempotencyConflictError();
  }

  return readbackAndVerify(
    input,
    existing.resourceId,
    true
  );
}

export async function executeQuoteCreate(
  rawInput: QuoteCreateInput
): Promise<VerifiedQuoteCreateResult> {
  const input =
    QuoteCreateInputSchema.parse(rawInput);

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

  let quoteId: string;

  try {
    const created =
      await db.$transaction(async (tx) => {
        const raceCheck =
          await tx.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId:
                  input.organizationId,
                actionType: "quote.create",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new QuoteCreateIdempotencyConflictError();
          }

          return {
            quoteId: raceCheck.resourceId,
            replayed: true
          };
        }

        const customer =
          await tx.customer.findFirst({
            where: {
              id: input.customerId,
              organizationId:
                input.organizationId
            },
            select: { id: true, name: true }
          });

        if (!customer) {
          throw new CustomerNotFoundError();
        }

        const items = input.items ?? [];

        const requestedProductIds = Array.from(
          new Set(
            items
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

        const computedLines =
          items.map(computedLine);

        const hasItems = computedLines.length > 0;

        const amount = hasItems
          ? centsToAmount(
              computeQuoteTotalCents(
                computedLines.map(
                  line => line.lineTotalCents
                ),
                input.generalDiscountBasisPoints ??
                  null
              )
            )
          : input.amount ?? null;

        const quote = await tx.quote.create({
          data: {
            organizationId:
              input.organizationId,
            customerId: input.customerId,
            customerName: customer.name,
            title: input.title,
            amount,
            currency:
              input.currency ?? "TRY",
            notes: input.notes,
            customerNote: input.customerNote,
            specialTerms: input.specialTerms,
            validUntil:
              input.validUntil === undefined
                ? undefined
                : new Date(input.validUntil),
            generalDiscountBasisPoints:
              input.generalDiscountBasisPoints,
            deliveryTerm: input.deliveryTerm,
            deliveryMethod: input.deliveryMethod,
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
            createdByUserId: input.actorUserId
          }
        });

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
              quoteId: quote.id,
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

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType: "quote.create",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Quote",
            resourceId: quote.id,
            status: "PENDING"
          }
        });

        return {
          quoteId: quote.id,
          replayed: false
        };
      });

    quoteId = created.quoteId;

    if (created.replayed) {
      return readbackAndVerify(
        input,
        quoteId,
        true
      );
    }
  } catch (error) {
    if (
      error instanceof QuoteCreateIdempotencyConflictError ||
      error instanceof CustomerNotFoundError ||
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

  return readbackAndVerify(
    input,
    quoteId,
    false
  );
}
