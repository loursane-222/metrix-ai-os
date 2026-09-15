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

const TransformationLineInputSchema = z.object({
  productServiceId: z.string().trim().min(1),
  role: z.enum(["INPUT", "OUTPUT", "REMNANT", "SCRAP"]),
  quantity: z.number().refine(isValidPositiveQuantity, {
    message: "quantity must be positive with at most 3 decimal places"
  })
});

const TransformationRecordInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    locationId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    lines: z.array(TransformationLineInputSchema).min(2)
  })
  .refine(
    (data) => data.lines.some((line) => line.role === "INPUT"),
    { message: "at least one INPUT line is required" }
  )
  .refine(
    (data) => data.lines.some((line) => line.role !== "INPUT"),
    { message: "at least one OUTPUT, REMNANT, or SCRAP line is required" }
  );

export type TransformationRecordInput = z.input<
  typeof TransformationRecordInputSchema
>;

type ParsedInput = z.output<typeof TransformationRecordInputSchema>;
type ParsedLine = ParsedInput["lines"][number];

export type VerifiedTransformationLineResult = {
  id: string;
  productServiceId: string;
  role: ParsedLine["role"];
  quantity: number;
};

export type VerifiedTransformationRecordResult = {
  action: "transformation.record";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  transformation: {
    id: string;
    locationId: string;
    title: string;
    occurredAt: string;
    lines: VerifiedTransformationLineResult[];
    updatedBalances: Array<{ productServiceId: string; quantity: number }>;
  };
};

export class TransformationRecordIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "TransformationRecordIdempotencyConflictError";
  }
}

export class TransformationRecordVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "TransformationRecordVerificationError";
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
    locationId: input.locationId,
    title: input.title,
    occurredAt: input.occurredAt ?? null,
    lines: input.lines.map((line) => ({
      productServiceId: line.productServiceId,
      role: line.role,
      quantity: line.quantity
    }))
  });

  return createHash("sha256").update(canonical).digest("hex");
}

function movementKindAndDirectionForRole(
  role: ParsedLine["role"]
): { kind: "TRANSFORMATION_CONSUME" | "TRANSFORMATION_PRODUCE"; direction: "IN" | "OUT" } | null {
  if (role === "INPUT") {
    return { kind: "TRANSFORMATION_CONSUME", direction: "OUT" };
  }

  if (role === "OUTPUT" || role === "REMNANT") {
    return { kind: "TRANSFORMATION_PRODUCE", direction: "IN" };
  }

  return null;
}

async function readbackAndVerify(
  input: ParsedInput,
  transformationId: string,
  replayed: boolean
): Promise<VerifiedTransformationRecordResult> {
  const transformation = await db.transformation.findFirst({
    where: { id: transformationId, organizationId: input.organizationId },
    select: {
      id: true,
      locationId: true,
      title: true,
      occurredAt: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, productServiceId: true, role: true, quantity: true }
      }
    }
  });

  if (
    !transformation ||
    transformation.locationId !== input.locationId ||
    transformation.title !== input.title ||
    transformation.lines.length !== input.lines.length
  ) {
    throw new TransformationRecordVerificationError();
  }

  const involvedProductIds = new Set<string>();

  for (let i = 0; i < input.lines.length; i += 1) {
    const expected = input.lines[i];
    const actual = transformation.lines[i];

    if (
      !actual ||
      actual.productServiceId !== expected.productServiceId ||
      actual.role !== expected.role ||
      Number(actual.quantity) !== expected.quantity
    ) {
      throw new TransformationRecordVerificationError();
    }

    const movementSpec = movementKindAndDirectionForRole(expected.role);

    if (movementSpec) {
      involvedProductIds.add(expected.productServiceId);

      const movement = await db.inventoryMovement.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: "Transformation",
          sourceId: transformation.id,
          productServiceId: expected.productServiceId,
          direction: movementSpec.direction,
          kind: movementSpec.kind
        },
        select: { quantity: true, locationId: true }
      });

      if (
        !movement ||
        movement.locationId !== input.locationId ||
        Number(movement.quantity) !== expected.quantity
      ) {
        throw new TransformationRecordVerificationError();
      }
    } else {
      const scrapMovement = await db.inventoryMovement.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: "Transformation",
          sourceId: transformation.id,
          productServiceId: expected.productServiceId,
          kind: "TRANSFORMATION_PRODUCE"
        }
      });

      if (scrapMovement) {
        throw new TransformationRecordVerificationError();
      }
    }
  }

  const updatedBalances: Array<{ productServiceId: string; quantity: number }> = [];

  for (const productServiceId of involvedProductIds) {
    const movements = await db.inventoryMovement.findMany({
      where: {
        organizationId: input.organizationId,
        productServiceId,
        locationId: input.locationId
      },
      select: { quantity: true, direction: true }
    });

    const netQuantity = milliToQuantity(computeNetQuantityMilli(movements));

    if (netQuantity < 0) {
      throw new TransformationRecordVerificationError();
    }

    const cached = await db.inventoryBalance.findUnique({
      where: {
        organizationId_productServiceId_locationId: {
          organizationId: input.organizationId,
          productServiceId,
          locationId: input.locationId
        }
      }
    });

    if (!cached || Number(cached.quantity) !== netQuantity) {
      throw new TransformationRecordVerificationError();
    }

    updatedBalances.push({ productServiceId, quantity: netQuantity });
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "transformation.record",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "transformation.record",
    status: "VERIFIED",
    verified: true,
    replayed,
    transformation: {
      id: transformation.id,
      locationId: transformation.locationId,
      title: transformation.title,
      occurredAt: transformation.occurredAt.toISOString(),
      lines: transformation.lines.map((line) => ({
        id: line.id,
        productServiceId: line.productServiceId,
        role: line.role,
        quantity: Number(line.quantity)
      })),
      updatedBalances
    }
  };
}

async function resolveExistingByActionExecution(
  input: ParsedInput,
  hash: string
): Promise<VerifiedTransformationRecordResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "transformation.record",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new TransformationRecordIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeTransformationRecord(
  rawInput: TransformationRecordInput
): Promise<VerifiedTransformationRecordResult> {
  const input = TransformationRecordInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);
  const existing = await resolveExistingByActionExecution(input, hash);

  if (existing) return existing;

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  let transformationId: string;
  let replayed: boolean;

  try {
    const outcome = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "transformation.record",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new TransformationRecordIdempotencyConflictError();
        }

        return { transformationId: raceCheck.resourceId, replayed: true };
      }

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Location" WHERE "id" = ${input.locationId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

      if (locked.length === 0) {
        throw new LocationNotFoundError();
      }

      const distinctProductIds = [
        ...new Set(input.lines.map((line) => line.productServiceId))
      ].sort((a, b) => a.localeCompare(b));

      for (const productServiceId of distinctProductIds) {
        const productService = await tx.productService.findFirst({
          where: { id: productServiceId, organizationId: input.organizationId }
        });

        if (!productService) {
          throw new ProductServiceNotFoundError();
        }
      }

      const movementProductIds = distinctProductIds.filter((id) =>
        input.lines.some(
          (line) => line.productServiceId === id && line.role !== "SCRAP"
        )
      );

      for (const productServiceId of movementProductIds) {
        await tx.inventoryBalance.upsert({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: input.organizationId,
              productServiceId,
              locationId: input.locationId
            }
          },
          create: {
            organizationId: input.organizationId,
            productServiceId,
            locationId: input.locationId,
            quantity: 0
          },
          update: { updatedAt: new Date() }
        });
      }

      // Sufficiency guard: sum every INPUT line per product against the
      // CURRENT evidence-derived balance, tracking cumulative reservation
      // within this same transaction so two INPUT lines for the same
      // product are validated together, not independently.
      const reservedMilliByProduct = new Map<string, bigint>();

      for (const line of input.lines) {
        if (line.role !== "INPUT") continue;

        const currentMilli = computeNetQuantityMilli(
          await tx.inventoryMovement.findMany({
            where: {
              organizationId: input.organizationId,
              productServiceId: line.productServiceId,
              locationId: input.locationId
            },
            select: { quantity: true, direction: true }
          })
        );

        const alreadyReserved =
          reservedMilliByProduct.get(line.productServiceId) ?? BigInt(0);
        const lineMilli = quantityToMilli(line.quantity);

        if (alreadyReserved + lineMilli > currentMilli) {
          throw new InsufficientInventoryError();
        }

        reservedMilliByProduct.set(
          line.productServiceId,
          alreadyReserved + lineMilli
        );
      }

      const transformation = await tx.transformation.create({
        data: {
          organizationId: input.organizationId,
          locationId: input.locationId,
          title: input.title,
          occurredAt,
          createdByUserId: input.actorUserId
        }
      });

      for (let index = 0; index < input.lines.length; index += 1) {
        const line = input.lines[index];

        await tx.transformationLine.create({
          data: {
            organizationId: input.organizationId,
            transformationId: transformation.id,
            productServiceId: line.productServiceId,
            role: line.role,
            quantity: line.quantity,
            sortOrder: index
          }
        });

        const movementSpec = movementKindAndDirectionForRole(line.role);

        if (movementSpec) {
          await tx.inventoryMovement.create({
            data: {
              organizationId: input.organizationId,
              productServiceId: line.productServiceId,
              locationId: input.locationId,
              kind: movementSpec.kind,
              direction: movementSpec.direction,
              quantity: line.quantity,
              occurredAt,
              sourceType: "Transformation",
              sourceId: transformation.id
            }
          });
        }
      }

      for (const productServiceId of movementProductIds) {
        const netMilli = computeNetQuantityMilli(
          await tx.inventoryMovement.findMany({
            where: {
              organizationId: input.organizationId,
              productServiceId,
              locationId: input.locationId
            },
            select: { quantity: true, direction: true }
          })
        );

        await tx.inventoryBalance.update({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: input.organizationId,
              productServiceId,
              locationId: input.locationId
            }
          },
          data: { quantity: milliToQuantity(netMilli) }
        });
      }

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "transformation.record",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Transformation",
          resourceId: transformation.id,
          status: "PENDING"
        }
      });

      return { transformationId: transformation.id, replayed: false };
    });

    transformationId = outcome.transformationId;
    replayed = outcome.replayed;
  } catch (error) {
    if (
      error instanceof TransformationRecordIdempotencyConflictError ||
      error instanceof LocationNotFoundError ||
      error instanceof ProductServiceNotFoundError ||
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

  return readbackAndVerify(input, transformationId, replayed);
}
