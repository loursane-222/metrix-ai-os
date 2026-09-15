import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import {
  quantityToMilli,
  milliToQuantity,
  computeNetQuantityMilli,
  isValidPositiveQuantity
} from "../commercial/inventory-ledger";
import {
  LocationNotFoundError,
  ProductServiceNotFoundError,
  InsufficientInventoryError
} from "../commercial/inventory-errors";

export {
  LocationNotFoundError,
  ProductServiceNotFoundError,
  InsufficientInventoryError
} from "../commercial/inventory-errors";

const InventoryTransferInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    productServiceId: z.string().trim().min(1),
    fromLocationId: z.string().trim().min(1),
    toLocationId: z.string().trim().min(1),
    quantity: z.number().refine(isValidPositiveQuantity, {
      message: "quantity must be positive with at most 3 decimal places"
    }),
    occurredAt: z.string().datetime({ offset: true }).optional()
  })
  .refine((data) => data.fromLocationId !== data.toLocationId, {
    message: "fromLocationId and toLocationId must differ"
  });

export type InventoryTransferInput = z.input<
  typeof InventoryTransferInputSchema
>;

type ParsedInput = z.output<typeof InventoryTransferInputSchema>;

export type VerifiedInventoryTransferResult = {
  action: "inventory.transfer";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  transfer: {
    id: string;
    productServiceId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    occurredAt: string;
    fromLocationBalance: number;
    toLocationBalance: number;
  };
};

export class InventoryTransferIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "InventoryTransferIdempotencyConflictError";
  }
}

export class InventoryTransferVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "InventoryTransferVerificationError";
  }
}

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
    productServiceId: input.productServiceId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    quantity: input.quantity,
    occurredAt: input.occurredAt ?? null
  });

  return createHash("sha256").update(canonical).digest("hex");
}

async function currentBalance(
  tx: typeof db,
  organizationId: string,
  productServiceId: string,
  locationId: string
): Promise<number> {
  const movements = await tx.inventoryMovement.findMany({
    where: { organizationId, productServiceId, locationId },
    select: { quantity: true, direction: true }
  });

  return milliToQuantity(computeNetQuantityMilli(movements));
}

async function readbackAndVerify(
  input: ParsedInput,
  transferId: string,
  replayed: boolean
): Promise<VerifiedInventoryTransferResult> {
  const transfer = await db.inventoryTransfer.findFirst({
    where: { id: transferId, organizationId: input.organizationId },
    select: {
      id: true,
      productServiceId: true,
      fromLocationId: true,
      toLocationId: true,
      quantity: true,
      occurredAt: true
    }
  });

  if (
    !transfer ||
    transfer.productServiceId !== input.productServiceId ||
    transfer.fromLocationId !== input.fromLocationId ||
    transfer.toLocationId !== input.toLocationId ||
    Number(transfer.quantity) !== input.quantity
  ) {
    throw new InventoryTransferVerificationError();
  }

  const outMovement = await db.inventoryMovement.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceType: "InventoryTransfer",
      sourceId: transfer.id,
      direction: "OUT"
    }
  });

  const inMovement = await db.inventoryMovement.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceType: "InventoryTransfer",
      sourceId: transfer.id,
      direction: "IN"
    }
  });

  if (
    !outMovement ||
    outMovement.kind !== "TRANSFER" ||
    outMovement.locationId !== input.fromLocationId ||
    Number(outMovement.quantity) !== input.quantity ||
    !inMovement ||
    inMovement.kind !== "TRANSFER" ||
    inMovement.locationId !== input.toLocationId ||
    Number(inMovement.quantity) !== input.quantity
  ) {
    throw new InventoryTransferVerificationError();
  }

  const fromLocationBalance = await currentBalance(
    db,
    input.organizationId,
    input.productServiceId,
    input.fromLocationId
  );
  const toLocationBalance = await currentBalance(
    db,
    input.organizationId,
    input.productServiceId,
    input.toLocationId
  );

  if (fromLocationBalance < 0 || toLocationBalance < 0) {
    throw new InventoryTransferVerificationError();
  }

  const cachedFrom = await db.inventoryBalance.findUnique({
    where: {
      organizationId_productServiceId_locationId: {
        organizationId: input.organizationId,
        productServiceId: input.productServiceId,
        locationId: input.fromLocationId
      }
    }
  });
  const cachedTo = await db.inventoryBalance.findUnique({
    where: {
      organizationId_productServiceId_locationId: {
        organizationId: input.organizationId,
        productServiceId: input.productServiceId,
        locationId: input.toLocationId
      }
    }
  });

  if (
    !cachedFrom ||
    Number(cachedFrom.quantity) !== fromLocationBalance ||
    !cachedTo ||
    Number(cachedTo.quantity) !== toLocationBalance
  ) {
    throw new InventoryTransferVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "inventory.transfer",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "inventory.transfer",
    status: "VERIFIED",
    verified: true,
    replayed,
    transfer: {
      id: transfer.id,
      productServiceId: transfer.productServiceId,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      quantity: Number(transfer.quantity),
      occurredAt: transfer.occurredAt.toISOString(),
      fromLocationBalance,
      toLocationBalance
    }
  };
}

async function resolveExistingByActionExecution(
  input: ParsedInput,
  hash: string
): Promise<VerifiedInventoryTransferResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "inventory.transfer",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new InventoryTransferIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeInventoryTransfer(
  rawInput: InventoryTransferInput
): Promise<VerifiedInventoryTransferResult> {
  const input = InventoryTransferInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);
  const existing = await resolveExistingByActionExecution(input, hash);

  if (existing) return existing;

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  let transferId: string;
  let replayed: boolean;

  try {
    const outcome = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "inventory.transfer",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new InventoryTransferIdempotencyConflictError();
        }

        return { transferId: raceCheck.resourceId, replayed: true };
      }

      const productService = await tx.productService.findFirst({
        where: {
          id: input.productServiceId,
          organizationId: input.organizationId
        }
      });

      if (!productService) {
        throw new ProductServiceNotFoundError();
      }

      // Lock both Location rows AND both InventoryBalance rows in one
      // fixed global order (sorted by locationId) so a concurrent
      // opposite-direction transfer between the same two locations can
      // never deadlock against this one.
      const sortedLocationIds = [
        input.fromLocationId,
        input.toLocationId
      ].sort((a, b) => a.localeCompare(b));

      for (const locationId of sortedLocationIds) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Location" WHERE "id" = ${locationId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

        if (locked.length === 0) {
          throw new LocationNotFoundError();
        }

        await tx.inventoryBalance.upsert({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: input.organizationId,
              productServiceId: input.productServiceId,
              locationId
            }
          },
          create: {
            organizationId: input.organizationId,
            productServiceId: input.productServiceId,
            locationId,
            quantity: 0
          },
          update: { updatedAt: new Date() }
        });
      }

      const currentFromMilli = computeNetQuantityMilli(
        await tx.inventoryMovement.findMany({
          where: {
            organizationId: input.organizationId,
            productServiceId: input.productServiceId,
            locationId: input.fromLocationId
          },
          select: { quantity: true, direction: true }
        })
      );

      const requestedMilli = quantityToMilli(input.quantity);

      if (requestedMilli > currentFromMilli) {
        throw new InsufficientInventoryError();
      }

      const transfer = await tx.inventoryTransfer.create({
        data: {
          organizationId: input.organizationId,
          productServiceId: input.productServiceId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          quantity: input.quantity,
          occurredAt,
          createdByUserId: input.actorUserId
        }
      });

      await tx.inventoryMovement.create({
        data: {
          organizationId: input.organizationId,
          productServiceId: input.productServiceId,
          locationId: input.fromLocationId,
          kind: "TRANSFER",
          direction: "OUT",
          quantity: input.quantity,
          occurredAt,
          sourceType: "InventoryTransfer",
          sourceId: transfer.id
        }
      });

      await tx.inventoryMovement.create({
        data: {
          organizationId: input.organizationId,
          productServiceId: input.productServiceId,
          locationId: input.toLocationId,
          kind: "TRANSFER",
          direction: "IN",
          quantity: input.quantity,
          occurredAt,
          sourceType: "InventoryTransfer",
          sourceId: transfer.id
        }
      });

      for (const locationId of [input.fromLocationId, input.toLocationId]) {
        const netMilli = computeNetQuantityMilli(
          await tx.inventoryMovement.findMany({
            where: {
              organizationId: input.organizationId,
              productServiceId: input.productServiceId,
              locationId
            },
            select: { quantity: true, direction: true }
          })
        );

        await tx.inventoryBalance.update({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: input.organizationId,
              productServiceId: input.productServiceId,
              locationId
            }
          },
          data: { quantity: milliToQuantity(netMilli) }
        });
      }

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "inventory.transfer",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "InventoryTransfer",
          resourceId: transfer.id,
          status: "PENDING"
        }
      });

      return { transferId: transfer.id, replayed: false };
    });

    transferId = outcome.transferId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof InventoryTransferIdempotencyConflictError ||
      error instanceof ProductServiceNotFoundError ||
      error instanceof LocationNotFoundError ||
      error instanceof InsufficientInventoryError
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

  return readbackAndVerify(input, transferId, replayed);
}
