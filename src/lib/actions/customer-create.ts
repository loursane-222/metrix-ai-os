import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const CustomerCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(500),
  email: z.string().trim().email().optional(),
  externalId: z.string().trim().min(1).max(500).optional()
});

export type CustomerCreateInput = z.input<
  typeof CustomerCreateInputSchema
>;

export type VerifiedCustomerCreateResult = {
  action: "customer.create";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  customer: {
    id: string;
    organizationId: string;
    name: string;
    email: string | null;
    externalId: string | null;
  };
};

export class CustomerCreateIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "CustomerCreateIdempotencyConflictError";
  }
}

export class CustomerCreateVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "CustomerCreateVerificationError";
  }
}

type ParsedInput = z.output<typeof CustomerCreateInputSchema>;

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    name: input.name,
    email: input.email ?? null,
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
): Promise<VerifiedCustomerCreateResult> {
  const customer = await db.customer.findFirst({
    where: {
      id: resourceId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      externalId: true
    }
  });

  if (
    !customer ||
    customer.organizationId !== input.organizationId ||
    customer.name !== input.name ||
    customer.email !== (input.email ?? null) ||
    customer.externalId !== (input.externalId ?? null)
  ) {
    throw new CustomerCreateVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "customer.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "customer.create",
    status: "VERIFIED",
    verified: true,
    replayed,
    customer
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedCustomerCreateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "customer.create",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;

  if (existing.requestHash !== hash) {
    throw new CustomerCreateIdempotencyConflictError();
  }

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeCustomerCreate(
  rawInput: CustomerCreateInput
): Promise<VerifiedCustomerCreateResult> {
  const input = CustomerCreateInputSchema.parse(rawInput);

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
            actionType: "customer.create",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new CustomerCreateIdempotencyConflictError();
        }

        return {
          resourceId: raceCheck.resourceId,
          replayed: true
        };
      }

      const customer = await tx.customer.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          email: input.email,
          externalId: input.externalId
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "customer.create",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Customer",
          resourceId: customer.id,
          status: "PENDING"
        }
      });

      return {
        resourceId: customer.id,
        replayed: false
      };
    });

    resourceId = created.resourceId;

    if (created.replayed) {
      return readbackAndVerify(input, resourceId, true);
    }
  } catch (error) {
    if (error instanceof CustomerCreateIdempotencyConflictError) {
      throw error;
    }

    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);

    if (!raced) throw error;

    return raced;
  }

  return readbackAndVerify(input, resourceId, false);
}
