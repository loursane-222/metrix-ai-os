import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const SupplierCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(500),
  externalId: z.string().trim().min(1).max(500).optional()
});

export type SupplierCreateInput = z.input<typeof SupplierCreateInputSchema>;

type ParsedInput = z.output<typeof SupplierCreateInputSchema>;

export type VerifiedSupplierCreateResult = {
  action: "supplier.create";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  supplier: {
    id: string;
    organizationId: string;
    name: string;
    externalId: string | null;
  };
};

export class SupplierCreateIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "SupplierCreateIdempotencyConflictError";
  }
}

export class SupplierCreateVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "SupplierCreateVerificationError";
  }
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    name: input.name,
    externalId: input.externalId ?? null
  });

  return createHash("sha256").update(canonical).digest("hex");
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function readbackAndVerify(
  input: ParsedInput,
  resourceId: string,
  replayed: boolean
): Promise<VerifiedSupplierCreateResult> {
  const supplier = await db.supplier.findFirst({
    where: { id: resourceId, organizationId: input.organizationId },
    select: { id: true, organizationId: true, name: true, externalId: true }
  });

  if (
    !supplier ||
    supplier.name !== input.name ||
    supplier.externalId !== (input.externalId ?? null)
  ) {
    throw new SupplierCreateVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "supplier.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "supplier.create",
    status: "VERIFIED",
    verified: true,
    replayed,
    supplier
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedSupplierCreateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "supplier.create",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new SupplierCreateIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeSupplierCreate(
  rawInput: SupplierCreateInput
): Promise<VerifiedSupplierCreateResult> {
  const input = SupplierCreateInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);
  const existing = await resolveExisting(input, hash);

  if (existing) return existing;

  let resourceId: string;

  try {
    const created = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "supplier.create",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new SupplierCreateIdempotencyConflictError();
        }

        return { resourceId: raceCheck.resourceId, replayed: true };
      }

      const supplier = await tx.supplier.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          externalId: input.externalId
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "supplier.create",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Supplier",
          resourceId: supplier.id,
          status: "PENDING"
        }
      });

      return { resourceId: supplier.id, replayed: false };
    });

    resourceId = created.resourceId;

    if (created.replayed) {
      return readbackAndVerify(input, resourceId, true);
    }
  } catch (error) {
    if (error instanceof SupplierCreateIdempotencyConflictError) {
      throw error;
    }

    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);

    if (!raced) throw error;

    return raced;
  }

  return readbackAndVerify(input, resourceId, false);
}
