import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

const CustomerUpdateInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    customerId: z.string().trim().min(1),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    address: z.string().trim().min(1).max(1000).optional(),
    taxNumber: z.string().trim().min(1).max(50).optional(),
    taxOffice: z.string().trim().min(1).max(200).optional(),
    contactName: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().trim().min(1).max(50).optional(),
    notes: z.string().trim().min(1).max(5000).optional()
  })
  .refine(
    input =>
      input.email !== undefined ||
      input.phone !== undefined ||
      input.address !== undefined ||
      input.taxNumber !== undefined ||
      input.taxOffice !== undefined ||
      input.contactName !== undefined ||
      input.contactPhone !== undefined ||
      input.notes !== undefined,
    {
      message: "At least one mutable field is required"
    }
  );

export type CustomerUpdateInput =
  z.input<typeof CustomerUpdateInputSchema>;

type ParsedInput = z.output<typeof CustomerUpdateInputSchema>;

export type VerifiedCustomerUpdateResult = {
  action: "customer.update";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  customer: {
    id: string;
    organizationId: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    contactName: string | null;
    contactPhone: string | null;
    notes: string | null;
    externalId: string | null;
  };
};

export class CustomerUpdateIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "CustomerUpdateIdempotencyConflictError";
  }
}

export class CustomerUpdateVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "CustomerUpdateVerificationError";
  }
}

export class CustomerNotFoundError extends Error {
  readonly code = "CUSTOMER_NOT_FOUND";

  constructor() {
    super("Customer was not found in the authorized organization");
    this.name = "CustomerNotFoundError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return (error as { code?: string }).code === "P2002";
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    customerId: input.customerId,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    taxNumber: input.taxNumber ?? null,
    taxOffice: input.taxOffice ?? null,
    contactName: input.contactName ?? null,
    contactPhone: input.contactPhone ?? null,
    notes: input.notes ?? null
  });

  return createHash("sha256").update(canonical).digest("hex");
}

const customerSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  taxNumber: true,
  taxOffice: true,
  contactName: true,
  contactPhone: true,
  notes: true,
  externalId: true
} as const;

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedCustomerUpdateResult> {
  const customer = await db.customer.findFirst({
    where: {
      id: input.customerId,
      organizationId: input.organizationId
    },
    select: customerSelect
  });

  if (
    !customer ||
    customer.organizationId !== input.organizationId ||
    (input.email !== undefined && customer.email !== input.email) ||
    (input.phone !== undefined && customer.phone !== input.phone) ||
    (input.address !== undefined && customer.address !== input.address) ||
    (input.taxNumber !== undefined &&
      customer.taxNumber !== input.taxNumber) ||
    (input.taxOffice !== undefined &&
      customer.taxOffice !== input.taxOffice) ||
    (input.contactName !== undefined &&
      customer.contactName !== input.contactName) ||
    (input.contactPhone !== undefined &&
      customer.contactPhone !== input.contactPhone) ||
    (input.notes !== undefined && customer.notes !== input.notes)
  ) {
    throw new CustomerUpdateVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "customer.update",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "customer.update",
    status: "VERIFIED",
    verified: true,
    replayed,
    customer
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedCustomerUpdateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "customer.update",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new CustomerUpdateIdempotencyConflictError();
  }

  return readbackAndVerify(input, true);
}

export async function executeCustomerUpdate(
  rawInput: CustomerUpdateInput
): Promise<VerifiedCustomerUpdateResult> {
  const input = CustomerUpdateInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);

  if (existing) {
    return existing;
  }

  try {
    const outcome = await db.$transaction(async (tx) => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "customer.update",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) {
          throw new CustomerUpdateIdempotencyConflictError();
        }

        return { replayed: true };
      }

      const target = await tx.customer.findFirst({
        where: {
          id: input.customerId,
          organizationId: input.organizationId
        },
        select: { id: true }
      });

      if (!target) {
        throw new CustomerNotFoundError();
      }

      await tx.customer.update({
        where: { id: target.id },
        data: {
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.address !== undefined
            ? { address: input.address }
            : {}),
          ...(input.taxNumber !== undefined
            ? { taxNumber: input.taxNumber }
            : {}),
          ...(input.taxOffice !== undefined
            ? { taxOffice: input.taxOffice }
            : {}),
          ...(input.contactName !== undefined
            ? { contactName: input.contactName }
            : {}),
          ...(input.contactPhone !== undefined
            ? { contactPhone: input.contactPhone }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {})
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "customer.update",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Customer",
          resourceId: target.id,
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
      error instanceof CustomerUpdateIdempotencyConflictError ||
      error instanceof CustomerNotFoundError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced = await resolveExisting(input, hash);

    if (!raced) {
      throw error;
    }

    return raced;
  }

  return readbackAndVerify(input, false);
}
