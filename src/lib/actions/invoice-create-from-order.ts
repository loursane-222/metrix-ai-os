import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";
import {
  computeLineNetCents,
  computeLineTotalCents,
  computeQuoteTotalCents,
  centsToAmount
} from "../commercial/quote-totals";

const InvoiceCreateFromOrderInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  orderId: z.string().trim().min(1)
});

export type InvoiceCreateFromOrderInput =
  z.input<typeof InvoiceCreateFromOrderInputSchema>;

type ParsedInput = z.output<
  typeof InvoiceCreateFromOrderInputSchema
>;

export type VerifiedInvoiceItemResult = {
  id: string;
  orderItemId: string;
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

export type VerifiedInvoiceCreateFromOrderResult = {
  action: "invoice.create_from_order";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  invoice: {
    id: string;
    invoiceNumber: string;
    sourceOrderId: string;
    customerId: string;
    title: string;
    amount: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    status: "DRAFT";
    items: VerifiedInvoiceItemResult[];
  };
};

export class InvoiceCreateIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name =
      "InvoiceCreateIdempotencyConflictError";
  }
}

export class InvoiceCreateVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "InvoiceCreateVerificationError";
  }
}

export class OrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";

  constructor() {
    super(
      "Order was not found in the authorized organization"
    );
    this.name = "OrderNotFoundError";
  }
}

export class OrderHasNoItemsError extends Error {
  readonly code = "ORDER_HAS_NO_ITEMS";

  constructor() {
    super(
      "Order has no items and cannot be invoiced"
    );
    this.name = "OrderHasNoItemsError";
  }
}

export class OrderAmountMismatchError extends Error {
  readonly code = "ORDER_AMOUNT_MISMATCH";

  constructor() {
    super(
      "Deterministic totals computed from persisted OrderItems do " +
        "not match the persisted Order amount"
    );
    this.name = "OrderAmountMismatchError";
  }
}

const INVOICE_NUMBER_PREFIX = "FTR-";
const MAX_INVOICE_NUMBER_ATTEMPTS = 5;

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
    orderId: input.orderId
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

type OrderItemLine = {
  id: string;
  productServiceId: string | null;
  name: string;
  unit: string | null;
  quantity: unknown;
  unitPriceCents: bigint;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
  lineTotalCents: bigint;
  sortOrder: number;
};

/**
 * Deterministic net/tax/total split derived exclusively from persisted
 * OrderItem truth. Reuses the canonical Quote money functions rather than
 * inventing a second formula; the same generalDiscountBasisPoints ratio is
 * applied to both the pre-VAT and VAT-inclusive sums so amount + taxAmount
 * === totalAmount holds exactly (integer cents arithmetic throughout).
 */
function computeOrderInvoiceTotals(
  items: readonly OrderItemLine[],
  generalDiscountBasisPoints: number | null
): {
  netAmountCents: bigint;
  totalAmountCents: bigint;
  taxAmountCents: bigint;
} {
  const netLineCents = items.map(item =>
    computeLineNetCents({
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents,
      discountBasisPoints: item.discountBasisPoints
    })
  );

  const grossLineCents = items.map(
    item => item.lineTotalCents
  );

  const netAmountCents = computeQuoteTotalCents(
    netLineCents,
    generalDiscountBasisPoints
  );

  const totalAmountCents = computeQuoteTotalCents(
    grossLineCents,
    generalDiscountBasisPoints
  );

  return {
    netAmountCents,
    totalAmountCents,
    taxAmountCents: totalAmountCents - netAmountCents
  };
}

function assertLineTotalsConsistent(
  items: readonly OrderItemLine[]
): void {
  for (const item of items) {
    const expected = computeLineTotalCents({
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents,
      discountBasisPoints: item.discountBasisPoints,
      vatRateBasisPoints: item.vatRateBasisPoints
    });

    if (expected !== item.lineTotalCents) {
      throw new OrderAmountMismatchError();
    }
  }
}

async function readbackAndVerify(
  input: ParsedInput,
  invoiceId: string,
  replayed: boolean
): Promise<VerifiedInvoiceCreateFromOrderResult> {
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      invoiceNumber: true,
      sourceOrderId: true,
      customerId: true,
      title: true,
      amount: true,
      taxAmount: true,
      totalAmount: true,
      currency: true,
      status: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          orderItemId: true,
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
    !invoice ||
    invoice.organizationId !== input.organizationId ||
    invoice.sourceOrderId !== input.orderId
  ) {
    throw new InvoiceCreateVerificationError();
  }

  const order = await db.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId
    },
    select: {
      customerId: true,
      title: true,
      currency: true,
      notes: true,
      amount: true,
      generalDiscountBasisPoints: true,
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
    invoice.customerId !== order.customerId ||
    invoice.title !== order.title ||
    invoice.currency !== order.currency ||
    invoice.items.length !== order.items.length
  ) {
    throw new InvoiceCreateVerificationError();
  }

  assertLineTotalsConsistent(order.items);

  const {
    netAmountCents,
    totalAmountCents,
    taxAmountCents
  } = computeOrderInvoiceTotals(
    order.items,
    order.generalDiscountBasisPoints
  );

  if (
    order.amount === null ||
    Number(order.amount) !==
      centsToAmount(totalAmountCents) ||
    Number(invoice.amount) !==
      centsToAmount(netAmountCents) ||
    Number(invoice.taxAmount) !==
      centsToAmount(taxAmountCents) ||
    Number(invoice.totalAmount) !==
      centsToAmount(totalAmountCents) ||
    Number(invoice.amount) +
      Number(invoice.taxAmount) !==
      Number(invoice.totalAmount)
  ) {
    throw new InvoiceCreateVerificationError();
  }

  for (let i = 0; i < order.items.length; i += 1) {
    const invoiceItem = invoice.items[i];
    const orderItem = order.items[i];

    if (
      !invoiceItem ||
      invoiceItem.orderItemId !== orderItem.id ||
      invoiceItem.productServiceId !==
        orderItem.productServiceId ||
      invoiceItem.name !== orderItem.name ||
      invoiceItem.unit !== orderItem.unit ||
      Number(invoiceItem.quantity) !==
        Number(orderItem.quantity) ||
      invoiceItem.unitPriceCents !==
        orderItem.unitPriceCents ||
      invoiceItem.discountBasisPoints !==
        orderItem.discountBasisPoints ||
      invoiceItem.vatRateBasisPoints !==
        orderItem.vatRateBasisPoints ||
      invoiceItem.lineTotalCents !==
        orderItem.lineTotalCents
    ) {
      throw new InvoiceCreateVerificationError();
    }
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "invoice.create_from_order",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "invoice.create_from_order",
    status: "VERIFIED",
    verified: true,
    replayed,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sourceOrderId: invoice.sourceOrderId,
      customerId: invoice.customerId,
      title: invoice.title,
      amount: Number(invoice.amount),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      currency: invoice.currency,
      status: invoice.status,
      items: invoice.items.map(item => ({
        id: item.id,
        orderItemId: item.orderItemId,
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
): Promise<VerifiedInvoiceCreateFromOrderResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "invoice.create_from_order",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new InvoiceCreateIdempotencyConflictError();
  }

  return readbackAndVerify(
    input,
    existing.resourceId,
    true
  );
}

export async function executeInvoiceCreateFromOrder(
  rawInput: InvoiceCreateFromOrderInput
): Promise<VerifiedInvoiceCreateFromOrderResult> {
  const input =
    InvoiceCreateFromOrderInputSchema.parse(
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

  let invoiceId: string;
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
                  "invoice.create_from_order",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new InvoiceCreateIdempotencyConflictError();
          }

          return {
            invoiceId: raceCheck.resourceId,
            replayed: true
          };
        }

        // Task 16 one-full-invoice-per-order is a deliberate POLICY,
        // not a schema-level unique constraint (a mature domain may
        // later invoice the same Order more than once, e.g. partial
        // invoicing per delivery). Concurrency safety therefore comes
        // from row-level locking, not a DB unique index: lock the
        // target Order row first, and only after the lock is held look
        // for an already-materialized Invoice. Two concurrent calls for
        // the same Order serialize on this lock; the second sees the
        // first's committed Invoice and replays instead of creating a
        // second one.
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

        if (locked.length === 0) {
          throw new OrderNotFoundError();
        }

        const order = await tx.order.findFirst({
          where: {
            id: input.orderId,
            organizationId:
              input.organizationId
          },
          include: {
            items: {
              orderBy: { sortOrder: "asc" }
            }
          }
        });

        if (!order) {
          throw new OrderNotFoundError();
        }

        const existingInvoice =
          await tx.invoice.findFirst({
            where: {
              organizationId:
                input.organizationId,
              sourceOrderId: order.id
            },
            select: { id: true }
          });

        if (existingInvoice) {
          await tx.actionExecution.create({
            data: {
              organizationId:
                input.organizationId,
              actionType:
                "invoice.create_from_order",
              idempotencyKey:
                input.idempotencyKey,
              requestHash: hash,
              resourceType: "Invoice",
              resourceId: existingInvoice.id,
              status: "PENDING"
            }
          });

          return {
            invoiceId: existingInvoice.id,
            replayed: true
          };
        }

        if (order.items.length === 0) {
          throw new OrderHasNoItemsError();
        }

        assertLineTotalsConsistent(order.items);

        const {
          netAmountCents,
          totalAmountCents,
          taxAmountCents
        } = computeOrderInvoiceTotals(
          order.items,
          order.generalDiscountBasisPoints
        );

        if (
          order.amount === null ||
          Number(order.amount) !==
            centsToAmount(totalAmountCents)
        ) {
          throw new OrderAmountMismatchError();
        }

        let createdInvoiceId: string | undefined;
        let lastError: unknown;

        for (
          let attempt = 0;
          attempt < MAX_INVOICE_NUMBER_ATTEMPTS;
          attempt += 1
        ) {
          const existingCount =
            await tx.invoice.count({
              where: {
                organizationId:
                  input.organizationId
              }
            });

          const year = new Date().getFullYear();

          const invoiceNumber =
            `${INVOICE_NUMBER_PREFIX}${year}-${String(
              existingCount + 1 + attempt
            ).padStart(4, "0")}`;

          try {
            const created =
              await tx.invoice.create({
                data: {
                  organizationId:
                    input.organizationId,
                  customerId: order.customerId,
                  sourceOrderId: order.id,
                  invoiceNumber,
                  title: order.title,
                  amount:
                    centsToAmount(netAmountCents),
                  taxAmount:
                    centsToAmount(taxAmountCents),
                  totalAmount: centsToAmount(
                    totalAmountCents
                  ),
                  currency: order.currency,
                  notes: order.notes,
                  createdByUserId:
                    input.actorUserId
                }
              });

            createdInvoiceId = created.id;
            break;
          } catch (error) {
            if (!isUniqueConflict(error)) {
              throw error;
            }

            lastError = error;
          }
        }

        if (!createdInvoiceId) {
          throw (
            lastError ??
            new Error(
              "Could not allocate a unique invoice number"
            )
          );
        }

        for (
          let index = 0;
          index < order.items.length;
          index += 1
        ) {
          const item = order.items[index];

          await tx.invoiceItem.create({
            data: {
              organizationId:
                input.organizationId,
              invoiceId: createdInvoiceId,
              orderItemId: item.id,
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
              sortOrder: item.sortOrder
            }
          });
        }

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType:
              "invoice.create_from_order",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Invoice",
            resourceId: createdInvoiceId,
            status: "PENDING"
          }
        });

        return {
          invoiceId: createdInvoiceId,
          replayed: false
        };
      });

    invoiceId = outcome.invoiceId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof InvoiceCreateIdempotencyConflictError ||
      error instanceof OrderNotFoundError ||
      error instanceof OrderHasNoItemsError ||
      error instanceof OrderAmountMismatchError
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

    const existingInvoice =
      await db.invoice.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceOrderId: input.orderId
        },
        select: { id: true }
      });

    if (!existingInvoice) {
      throw error;
    }

    await db.actionExecution
      .create({
        data: {
          organizationId:
            input.organizationId,
          actionType:
            "invoice.create_from_order",
          idempotencyKey:
            input.idempotencyKey,
          requestHash: hash,
          resourceType: "Invoice",
          resourceId: existingInvoice.id,
          status: "PENDING"
        }
      })
      .catch(() => undefined);

    return readbackAndVerify(
      input,
      existingInvoice.id,
      true
    );
  }

  return readbackAndVerify(
    input,
    invoiceId,
    replayed
  );
}
