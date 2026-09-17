import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { isApprovableActionType } from "./approvable-actions";

const ApprovalRequestInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  actionType: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  expiresInMinutes: z.number().int().positive().max(60 * 24 * 30).optional()
});

export type ApprovalRequestInput = z.input<typeof ApprovalRequestInputSchema>;

type ParsedInput = z.output<typeof ApprovalRequestInputSchema>;

export type VerifiedApprovalRequestResult = {
  action: "approval.request";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  approval: {
    id: string;
    organizationId: string;
    requestedById: string;
    actionType: string;
    payload: Record<string, unknown>;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";
    expiresAt: string | null;
    createdAt: string;
  };
};

export class UnknownApprovableActionError extends Error {
  readonly code = "UNKNOWN_APPROVABLE_ACTION";
  constructor() {
    super("actionType is not a registered approvable action");
    this.name = "UnknownApprovableActionError";
  }
}

export class ApprovalIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "ApprovalIdempotencyConflictError";
  }
}

export class ApprovalVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";
  constructor() {
    super("Action could not be verified by readback");
    this.name = "ApprovalVerificationError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return (error as { code?: string }).code === "P2002";
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    payload: input.payload,
    expiresInMinutes: input.expiresInMinutes ?? null
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function toResult(approval: {
  id: string;
  organizationId: string;
  requestedById: string;
  actionType: string;
  payload: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";
  expiresAt: Date | null;
  createdAt: Date;
}, replayed: boolean): VerifiedApprovalRequestResult {
  return {
    action: "approval.request",
    status: "VERIFIED",
    verified: true,
    replayed,
    approval: {
      id: approval.id,
      organizationId: approval.organizationId,
      requestedById: approval.requestedById,
      actionType: approval.actionType,
      payload: JSON.parse(approval.payload),
      status: approval.status,
      expiresAt: approval.expiresAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString()
    }
  };
}

async function readbackAndVerify(
  input: ParsedInput,
  approvalId: string,
  replayed: boolean
): Promise<VerifiedApprovalRequestResult> {
  const approval = await db.approvalRequest.findFirst({
    where: { id: approvalId, organizationId: input.organizationId }
  });

  if (!approval || approval.actionType !== input.actionType || approval.requestedById !== input.actorUserId) {
    throw new ApprovalVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "approval.request",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return toResult(approval, replayed);
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedApprovalRequestResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "approval.request",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new ApprovalIdempotencyConflictError();

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeApprovalRequest(
  rawInput: ApprovalRequestInput
): Promise<VerifiedApprovalRequestResult> {
  const input = ApprovalRequestInputSchema.parse(rawInput);

  if (!isApprovableActionType(input.actionType)) {
    throw new UnknownApprovableActionError();
  }

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);
  if (existing) return existing;

  const payloadJson = JSON.stringify(input.payload);
  const snapshotHash = createHash("sha256").update(payloadJson).digest("hex");
  const expiresAt = input.expiresInMinutes ? new Date(Date.now() + input.expiresInMinutes * 60_000) : null;

  let approvalId: string;

  try {
    const created = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "approval.request",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new ApprovalIdempotencyConflictError();
        return { approvalId: raceCheck.resourceId, replayed: true };
      }

      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: input.organizationId,
          requestedById: input.actorUserId,
          actionType: input.actionType,
          payload: payloadJson,
          snapshotHash,
          expiresAt
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "approval.request",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "ApprovalRequest",
          resourceId: approval.id,
          status: "PENDING"
        }
      });

      return { approvalId: approval.id, replayed: false };
    });

    approvalId = created.approvalId;

    if (created.replayed) {
      return readbackAndVerify(input, approvalId, true);
    }
  } catch (error) {
    if (error instanceof ApprovalIdempotencyConflictError) throw error;
    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerify(input, approvalId, false);
}
