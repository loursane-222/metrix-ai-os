import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

import type { LocationKind } from "../../generated/prisma/enums";

const LocationCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(500),
  kind: z.enum(["WAREHOUSE", "STORE", "BRANCH", "PRODUCTION_AREA"]),
  externalId: z.string().trim().min(1).max(500).optional()
});

export type LocationCreateInput = z.input<typeof LocationCreateInputSchema>;

type ParsedInput = z.output<typeof LocationCreateInputSchema>;

export type VerifiedLocationCreateResult = {
  action: "location.create";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  location: {
    id: string;
    organizationId: string;
    name: string;
    kind: LocationKind;
    externalId: string | null;
  };
};

export class LocationCreateIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "LocationCreateIdempotencyConflictError";
  }
}

export class LocationCreateVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "LocationCreateVerificationError";
  }
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    name: input.name,
    kind: input.kind,
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
): Promise<VerifiedLocationCreateResult> {
  const location = await db.location.findFirst({
    where: { id: resourceId, organizationId: input.organizationId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      kind: true,
      externalId: true
    }
  });

  if (
    !location ||
    location.name !== input.name ||
    location.kind !== input.kind ||
    location.externalId !== (input.externalId ?? null)
  ) {
    throw new LocationCreateVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "location.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "location.create",
    status: "VERIFIED",
    verified: true,
    replayed,
    location
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedLocationCreateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "location.create",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new LocationCreateIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeLocationCreate(
  rawInput: LocationCreateInput
): Promise<VerifiedLocationCreateResult> {
  const input = LocationCreateInputSchema.parse(rawInput);

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
            actionType: "location.create",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new LocationCreateIdempotencyConflictError();
        }

        return { resourceId: raceCheck.resourceId, replayed: true };
      }

      const location = await tx.location.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          kind: input.kind,
          externalId: input.externalId
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "location.create",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Location",
          resourceId: location.id,
          status: "PENDING"
        }
      });

      return { resourceId: location.id, replayed: false };
    });

    resourceId = created.resourceId;

    if (created.replayed) {
      return readbackAndVerify(input, resourceId, true);
    }
  } catch (error) {
    if (error instanceof LocationCreateIdempotencyConflictError) {
      throw error;
    }

    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);

    if (!raced) throw error;

    return raced;
  }

  return readbackAndVerify(input, resourceId, false);
}
