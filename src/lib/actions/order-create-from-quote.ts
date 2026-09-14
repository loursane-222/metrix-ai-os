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

const OrderCreateFromQuoteInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  quoteId: z.string().trim().min(1)
});

export type OrderCreateFromQuoteInput =
  z.input<typeof OrderCreateFromQuoteInputSchema>;

type ParsedInput = z.output<
  typeof OrderCreateFromQuoteInputSchema
>;

export type VerifiedOrderItemResult = {
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

export type VerifiedOrderCreateFromQuoteResult = {
  action: "order.create_from_quote";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  order: {
    id: string;
    orderNumber: string;
    sourceQuoteId: string;
    customerId: string;
    customerName: string;
    title: string;
    amount: number | null;
    currency: string;
    status: "DRAFT";
    items: VerifiedOrderItemResult[];
  };
};

export class OrderCreateIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "OrderCreateIdempotencyConflictError";
  }
}

export class OrderCreateVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "OrderCreateVerificationError";
  }
}

export class QuoteNotWonError extends Error {
  readonly code = "QUOTE_NOT_WON";

  constructor() {
    super(
      "Only a WON quote can be converted to an order"
    );
    this.name = "QuoteNotWonError";
  }
}

const ORDER_NUMBER_PREFIX = "SIP-";
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

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
  orderId: string,
  replayed: boolean
): Promise<VerifiedOrderCreateFromQuoteResult> {
  const order = await db.order.findFirst({
    where: {
      id: orderId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      orderNumber: true,
      sourceQuoteId: true,
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
    !order ||
    order.organizationId !== input.organizationId ||
    order.sourceQuoteId !== input.quoteId
  ) {
    throw new OrderCreateVerificationError();
  }

  const quote = await db.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId
    },
    select: {
      customerId: true,
      customerName: true,
      title: true,
      amount: true,
      currency: true,
      generalDiscountBasisPoints: true,
      deliveryTerm: true,
      deliveryMethod: true,
      notes: true,
      status: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
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
    quote.status !== "WON" ||
    order.customerId !== quote.customerId ||
    order.customerName !== quote.customerName ||
    order.title !== quote.title ||
    (order.amount === null) !==
      (quote.amount === null) ||
    (order.amount !== null &&
      quote.amount !== null &&
      Number(order.amount) !==
        Number(quote.amount)) ||
    order.currency !== quote.currency ||
    order.items.length !== quote.items.length
  ) {
    throw new OrderCreateVerificationError();
  }

  for (let i = 0; i < quote.items.length; i += 1) {
    const orderItem = order.items[i];
    const quoteItem = quote.items[i];

    if (
      !orderItem ||
      orderItem.productServiceId !==
        quoteItem.productServiceId ||
      orderItem.name !== quoteItem.name ||
      Number(orderItem.quantity) !==
        Number(quoteItem.quantity) ||
      orderItem.unitPriceCents !==
        quoteItem.unitPriceCents ||
      orderItem.discountBasisPoints !==
        quoteItem.discountBasisPoints ||
      orderItem.vatRateBasisPoints !==
        quoteItem.vatRateBasisPoints ||
      orderItem.lineTotalCents !==
        quoteItem.lineTotalCents
    ) {
      throw new OrderCreateVerificationError();
    }
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "order.create_from_quote",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "order.create_from_quote",
    status: "VERIFIED",
    verified: true,
    replayed,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      sourceQuoteId: order.sourceQuoteId,
      customerId: order.customerId,
      customerName: order.customerName,
      title: order.title,
      amount:
        order.amount === null
          ? null
          : Number(order.amount),
      currency: order.currency,
      status: order.status,
      items: order.items.map(item => ({
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

async function resolveExistingByActionExecution(
  input: ParsedInput,
  hash: string
): Promise<VerifiedOrderCreateFromQuoteResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "order.create_from_quote",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new OrderCreateIdempotencyConflictError();
  }

  return readbackAndVerify(
    input,
    existing.resourceId,
    true
  );
}

export async function executeOrderCreateFromQuote(
  rawInput: OrderCreateFromQuoteInput
): Promise<VerifiedOrderCreateFromQuoteResult> {
  const input =
    OrderCreateFromQuoteInputSchema.parse(
      rawInput
    );

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);

  const existing =
    await resolveExistingByActionExecution(
      input,
      hash
    );

  if (existing) {
    return existing;
  }

  let orderId: string;
  let replayed: boolean;

  try {
    const outcome =
      await db.$transaction(async (tx) => {
        const raceCheck =
          await tx.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId:
                  input.organizationId,
                actionType:
                  "order.create_from_quote",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new OrderCreateIdempotencyConflictError();
          }

          return {
            orderId: raceCheck.resourceId,
            replayed: true
          };
        }

        const quote = await tx.quote.findFirst({
          where: {
            id: input.quoteId,
            organizationId:
              input.organizationId
          },
          include: {
            items: {
              orderBy: { sortOrder: "asc" }
            }
          }
        });

        if (!quote) {
          throw new QuoteNotFoundError();
        }

        if (quote.status !== "WON") {
          throw new QuoteNotWonError();
        }

        // Second invariant, independent of idempotencyKey/turn:
        // at most one Order may ever exist for this Quote. A
        // different turn re-requesting the same conversion must
        // resolve to the already-materialized Order, never a
        // duplicate.
        const existingOrder =
          await tx.order.findFirst({
            where: {
              organizationId:
                input.organizationId,
              sourceQuoteId: quote.id
            },
            select: { id: true }
          });

        if (existingOrder) {
          await tx.actionExecution.create({
            data: {
              organizationId:
                input.organizationId,
              actionType:
                "order.create_from_quote",
              idempotencyKey:
                input.idempotencyKey,
              requestHash: hash,
              resourceType: "Order",
              resourceId: existingOrder.id,
              status: "PENDING"
            }
          });

          return {
            orderId: existingOrder.id,
            replayed: true
          };
        }

        let createdOrderId: string | undefined;
        let lastError: unknown;

        for (
          let attempt = 0;
          attempt < MAX_ORDER_NUMBER_ATTEMPTS;
          attempt += 1
        ) {
          const existingCount =
            await tx.order.count({
              where: {
                organizationId:
                  input.organizationId
              }
            });

          const orderNumber =
            `${ORDER_NUMBER_PREFIX}${String(
              existingCount + 1 + attempt
            ).padStart(4, "0")}`;

          try {
            const created = await tx.order.create(
              {
                data: {
                  organizationId:
                    input.organizationId,
                  customerId: quote.customerId,
                  sourceQuoteId: quote.id,
                  orderNumber,
                  customerName:
                    quote.customerName,
                  title: quote.title,
                  amount: quote.amount,
                  currency: quote.currency,
                  generalDiscountBasisPoints:
                    quote.generalDiscountBasisPoints,
                  deliveryTerm:
                    quote.deliveryTerm,
                  deliveryMethod:
                    quote.deliveryMethod,
                  notes: quote.notes,
                  createdByUserId:
                    input.actorUserId
                }
              }
            );

            createdOrderId = created.id;
            break;
          } catch (error) {
            if (!isUniqueConflict(error)) {
              throw error;
            }

            lastError = error;
          }
        }

        if (!createdOrderId) {
          throw (
            lastError ??
            new Error(
              "Could not allocate a unique order number"
            )
          );
        }

        for (
          let index = 0;
          index < quote.items.length;
          index += 1
        ) {
          const item = quote.items[index];

          await tx.orderItem.create({
            data: {
              organizationId:
                input.organizationId,
              orderId: createdOrderId,
              productServiceId:
                item.productServiceId,
              name: item.name,
              unit: item.unit,
              quantity: item.quantity,
              unitPriceCents:
                item.unitPriceCents,
              discountBasisPoints:
                item.discountBasisPoints,
              vatRateBasisPoints:
                item.vatRateBasisPoints,
              lineTotalCents:
                item.lineTotalCents,
              sortOrder: index
            }
          });
        }

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType:
              "order.create_from_quote",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Order",
            resourceId: createdOrderId,
            status: "PENDING"
          }
        });

        return {
          orderId: createdOrderId,
          replayed: false
        };
      });

    orderId = outcome.orderId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof OrderCreateIdempotencyConflictError ||
      error instanceof QuoteNotFoundError ||
      error instanceof QuoteNotWonError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced =
      await resolveExistingByActionExecution(
        input,
        hash
      );

    if (raced) {
      return raced;
    }

    const existingOrder =
      await db.order.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceQuoteId: input.quoteId
        },
        select: { id: true }
      });

    if (!existingOrder) {
      throw error;
    }

    await db.actionExecution
      .create({
        data: {
          organizationId:
            input.organizationId,
          actionType:
            "order.create_from_quote",
          idempotencyKey:
            input.idempotencyKey,
          requestHash: hash,
          resourceType: "Order",
          resourceId: existingOrder.id,
          status: "PENDING"
        }
      })
      .catch(() => undefined);

    return readbackAndVerify(
      input,
      existingOrder.id,
      true
    );
  }

  return readbackAndVerify(
    input,
    orderId,
    replayed
  );
}
