import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { computeLineNetCents, centsToAmount } from "../commercial/quote-totals";
import {
  quantityToMilli,
  milliToQuantity,
  isValidPositiveQuantity
} from "../commercial/inventory-ledger";
import {
  resolveUnitOfMeasure,
  UnitOfMeasureMismatchError
} from "../commercial/unit-of-measure";
import {
  LocationNotFoundError,
  SupplierNotFoundError,
  ProductServiceNotFoundError
} from "../commercial/inventory-errors";

export {
  LocationNotFoundError,
  SupplierNotFoundError,
  ProductServiceNotFoundError
} from "../commercial/inventory-errors";
export { UnitOfMeasureMismatchError } from "../commercial/unit-of-measure";

const PurchaseRecordItemInputSchema = z.object({
  productServiceId: z.string().trim().min(1),
  unit: z.string().trim().min(1).max(50),
  quantity: z.number().refine(isValidPositiveQuantity, {
    message: "quantity must be positive with at most 3 decimal places"
  }),
  unitCostCents: z.number().int().nonnegative()
});

const PurchaseRecordInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  supplierId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  items: z.array(PurchaseRecordItemInputSchema).min(1)
});

export type PurchaseRecordInput = z.input<typeof PurchaseRecordInputSchema>;

type ParsedInput = z.output<typeof PurchaseRecordInputSchema>;

export type VerifiedPurchaseItemResult = {
  id: string;
  productServiceId: string;
  quantity: number;
  unitCostCents: string;
  lineTotalCents: string;
};

export type VerifiedPurchaseRecordResult = {
  action: "purchase.record";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  purchase: {
    id: string;
    purchaseNumber: string;
    supplierId: string;
    locationId: string;
    currency: string;
    totalCostCents: string;
    items: VerifiedPurchaseItemResult[];
  };
};

export class PurchaseRecordIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "PurchaseRecordIdempotencyConflictError";
  }
}

export class PurchaseRecordVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "PurchaseRecordVerificationError";
  }
}

const PURCHASE_NUMBER_PREFIX = "SAT-";
const MAX_PURCHASE_NUMBER_ATTEMPTS = 5;

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    supplierId: input.supplierId,
    locationId: input.locationId,
    occurredAt: input.occurredAt ?? null,
    items: input.items.map((item) => ({
      productServiceId: item.productServiceId,
      unit: item.unit,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents
    }))
  });

  return createHash("sha256").update(canonical).digest("hex");
}

async function readbackAndVerify(
  input: ParsedInput,
  purchaseId: string,
  replayed: boolean
): Promise<VerifiedPurchaseRecordResult> {
  const purchase = await db.purchase.findFirst({
    where: { id: purchaseId, organizationId: input.organizationId },
    select: {
      id: true,
      purchaseNumber: true,
      supplierId: true,
      locationId: true,
      currency: true,
      totalCostCents: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          productServiceId: true,
          quantity: true,
          unitCostCents: true,
          lineTotalCents: true
        }
      }
    }
  });

  if (
    !purchase ||
    purchase.supplierId !== input.supplierId ||
    purchase.locationId !== input.locationId ||
    purchase.items.length !== input.items.length
  ) {
    throw new PurchaseRecordVerificationError();
  }

  let expectedTotalCents = BigInt(0);

  for (let i = 0; i < input.items.length; i += 1) {
    const expected = input.items[i];
    const actual = purchase.items[i];

    const expectedLineTotalCents = computeLineNetCents({
      quantity: expected.quantity,
      unitPriceCents: BigInt(expected.unitCostCents),
      discountBasisPoints: 0
    });

    if (
      !actual ||
      actual.productServiceId !== expected.productServiceId ||
      Number(actual.quantity) !== expected.quantity ||
      actual.unitCostCents !== BigInt(expected.unitCostCents) ||
      actual.lineTotalCents !== expectedLineTotalCents
    ) {
      throw new PurchaseRecordVerificationError();
    }

    expectedTotalCents += expectedLineTotalCents;

    const movement = await db.inventoryMovement.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceType: "Purchase",
        sourceId: purchase.id,
        productServiceId: expected.productServiceId
      },
      select: { quantity: true, direction: true, kind: true, locationId: true }
    });

    if (
      !movement ||
      movement.kind !== "PURCHASE_RECEIPT" ||
      movement.direction !== "IN" ||
      movement.locationId !== input.locationId ||
      Number(movement.quantity) !== expected.quantity
    ) {
      throw new PurchaseRecordVerificationError();
    }
  }

  if (purchase.totalCostCents !== expectedTotalCents) {
    throw new PurchaseRecordVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "purchase.record",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "purchase.record",
    status: "VERIFIED",
    verified: true,
    replayed,
    purchase: {
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      supplierId: purchase.supplierId,
      locationId: purchase.locationId,
      currency: purchase.currency,
      totalCostCents: purchase.totalCostCents.toString(),
      items: purchase.items.map((item) => ({
        id: item.id,
        productServiceId: item.productServiceId,
        quantity: Number(item.quantity),
        unitCostCents: item.unitCostCents.toString(),
        lineTotalCents: item.lineTotalCents.toString()
      }))
    }
  };
}

async function resolveExistingByActionExecution(
  input: ParsedInput,
  hash: string
): Promise<VerifiedPurchaseRecordResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "purchase.record",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new PurchaseRecordIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executePurchaseRecord(
  rawInput: PurchaseRecordInput
): Promise<VerifiedPurchaseRecordResult> {
  const input = PurchaseRecordInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);
  const existing = await resolveExistingByActionExecution(input, hash);

  if (existing) return existing;

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  let purchaseId: string;
  let replayed: boolean;

  try {
    const outcome = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "purchase.record",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new PurchaseRecordIdempotencyConflictError();
        }

        return { purchaseId: raceCheck.resourceId, replayed: true };
      }

      const lockedSupplier = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Supplier" WHERE "id" = ${input.supplierId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

      if (lockedSupplier.length === 0) {
        throw new SupplierNotFoundError();
      }

      const lockedLocation = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Location" WHERE "id" = ${input.locationId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

      if (lockedLocation.length === 0) {
        throw new LocationNotFoundError();
      }

      // Resolve/materialize each item's canonical unit, deterministically
      // and in a stable order (by productServiceId) so concurrent
      // purchases/transfers/transformations touching the same resources
      // never deadlock against each other.
      const sortedItems = [...input.items].sort((a, b) =>
        a.productServiceId.localeCompare(b.productServiceId)
      );

      const resolvedUnitByProduct = new Map<string, string>();

      for (const item of sortedItems) {
        const productService = await tx.productService.findFirst({
          where: { id: item.productServiceId, organizationId: input.organizationId }
        });

        if (!productService) {
          throw new ProductServiceNotFoundError();
        }

        const resolvedUnit = resolveUnitOfMeasure(item.unit);

        if (productService.unitOfMeasure === null) {
          await tx.productService.update({
            where: { id: productService.id },
            data: { unitOfMeasure: resolvedUnit }
          });
        } else if (productService.unitOfMeasure !== resolvedUnit) {
          throw new UnitOfMeasureMismatchError();
        }

        resolvedUnitByProduct.set(item.productServiceId, resolvedUnit);

        // Materialize-if-absent AND take the row lock in one atomic
        // upsert (INSERT ... ON CONFLICT DO UPDATE locks the row on
        // Postgres) — verified empirically by the real concurrency test.
        await tx.inventoryBalance.upsert({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: input.organizationId,
              productServiceId: item.productServiceId,
              locationId: input.locationId
            }
          },
          create: {
            organizationId: input.organizationId,
            productServiceId: item.productServiceId,
            locationId: input.locationId,
            quantity: 0
          },
          update: { updatedAt: new Date() }
        });
      }

      let createdPurchaseId: string | undefined;
      let lastError: unknown;

      for (
        let attempt = 0;
        attempt < MAX_PURCHASE_NUMBER_ATTEMPTS;
        attempt += 1
      ) {
        const existingCount = await tx.purchase.count({
          where: { organizationId: input.organizationId }
        });

        const purchaseNumber = `${PURCHASE_NUMBER_PREFIX}${String(
          existingCount + 1 + attempt
        ).padStart(4, "0")}`;

        try {
          let totalCostCents = BigInt(0);

          const created = await tx.purchase.create({
            data: {
              organizationId: input.organizationId,
              supplierId: input.supplierId,
              locationId: input.locationId,
              purchaseNumber,
              currency: input.currency ?? "TRY",
              totalCostCents: 0,
              notes: input.notes,
              createdByUserId: input.actorUserId
            }
          });

          for (let index = 0; index < input.items.length; index += 1) {
            const item = input.items[index];

            const lineTotalCents = computeLineNetCents({
              quantity: item.quantity,
              unitPriceCents: BigInt(item.unitCostCents),
              discountBasisPoints: 0
            });

            totalCostCents += lineTotalCents;

            await tx.purchaseItem.create({
              data: {
                organizationId: input.organizationId,
                purchaseId: created.id,
                productServiceId: item.productServiceId,
                quantity: item.quantity,
                unitCostCents: item.unitCostCents,
                lineTotalCents,
                sortOrder: index
              }
            });

            await tx.inventoryMovement.create({
              data: {
                organizationId: input.organizationId,
                productServiceId: item.productServiceId,
                locationId: input.locationId,
                kind: "PURCHASE_RECEIPT",
                direction: "IN",
                quantity: item.quantity,
                occurredAt,
                sourceType: "Purchase",
                sourceId: created.id
              }
            });

            const balance = await tx.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_productServiceId_locationId: {
                  organizationId: input.organizationId,
                  productServiceId: item.productServiceId,
                  locationId: input.locationId
                }
              }
            });

            const newQuantityMilli =
              quantityToMilli(Number(balance.quantity)) +
              quantityToMilli(item.quantity);

            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: { quantity: milliToQuantity(newQuantityMilli) }
            });
          }

          await tx.purchase.update({
            where: { id: created.id },
            data: { totalCostCents }
          });

          createdPurchaseId = created.id;
          break;
        } catch (error) {
          if (!isUniqueConflict(error)) {
            throw error;
          }

          lastError = error;
        }
      }

      if (!createdPurchaseId) {
        throw (
          lastError ??
          new Error("Could not allocate a unique purchase number")
        );
      }

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "purchase.record",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Purchase",
          resourceId: createdPurchaseId,
          status: "PENDING"
        }
      });

      return { purchaseId: createdPurchaseId, replayed: false };
    });

    purchaseId = outcome.purchaseId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof PurchaseRecordIdempotencyConflictError ||
      error instanceof SupplierNotFoundError ||
      error instanceof LocationNotFoundError ||
      error instanceof ProductServiceNotFoundError ||
      error instanceof UnitOfMeasureMismatchError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced = await resolveExistingByActionExecution(input, hash);

    if (!raced) {
      throw error;
    }

    return raced;
  }

  return readbackAndVerify(input, purchaseId, replayed);
}
