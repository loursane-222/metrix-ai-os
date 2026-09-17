import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { APPROVABLE_ACTIONS } from "./approvable-actions";

const ApprovalResolveInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  approvalId: z.string().trim().min(1),
  decision: z.enum(["APPROVE", "REJECT"])
});

export type ApprovalResolveInput = z.input<typeof ApprovalResolveInputSchema>;

type ParsedInput = z.output<typeof ApprovalResolveInputSchema>;

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";

export type VerifiedApprovalResolveResult = {
  action: "approval.resolve";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  approval: {
    id: string;
    actionType: string;
    status: ApprovalStatus;
    resolvedAt: string | null;
  };
  execution: Record<string, unknown> | null;
};

export class ApprovalNotFoundError extends Error {
  readonly code = "APPROVAL_NOT_FOUND";
  constructor() {
    super("Approval request was not found in the authorized organization");
    this.name = "ApprovalNotFoundError";
  }
}

export class ApprovalApproverNotPermittedError extends Error {
  readonly code = "APPROVAL_APPROVER_NOT_PERMITTED";
  constructor() {
    super("Only an organization ADMIN or OWNER may resolve an approval");
    this.name = "ApprovalApproverNotPermittedError";
  }
}

export class ApprovalExpiredError extends Error {
  readonly code = "APPROVAL_EXPIRED";
  constructor() {
    super("Approval request has expired");
    this.name = "ApprovalExpiredError";
  }
}

export class ApprovalAlreadyResolvedError extends Error {
  readonly code = "APPROVAL_ALREADY_RESOLVED";
  constructor() {
    super("Approval request was already resolved");
    this.name = "ApprovalAlreadyResolvedError";
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

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    approvalId: input.approvalId,
    decision: input.decision
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedApprovalResolveResult> {
  const approval = await db.approvalRequest.findFirst({
    where: { id: input.approvalId, organizationId: input.organizationId }
  });

  const expectedStatus: ApprovalStatus = input.decision === "REJECT" ? "REJECTED" : "EXECUTED";

  if (!approval || approval.status !== expectedStatus) {
    throw new ApprovalVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "approval.resolve",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  const execution = await db.actionExecution.findFirst({
    where: {
      organizationId: input.organizationId,
      resourceType: "ApprovalRequest",
      resourceId: approval.id,
      actionType: "approval.resolve"
    }
  });

  return {
    action: "approval.resolve",
    status: "VERIFIED",
    verified: true,
    replayed,
    approval: {
      id: approval.id,
      actionType: approval.actionType,
      status: approval.status,
      resolvedAt: approval.resolvedAt?.toISOString() ?? null
    },
    execution: execution ? { recorded: true } : null
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedApprovalResolveResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "approval.resolve",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new ApprovalIdempotencyConflictError();

  return readbackAndVerify(input, true);
}

export async function executeApprovalResolve(
  rawInput: ApprovalResolveInput
): Promise<VerifiedApprovalResolveResult> {
  const input = ApprovalResolveInputSchema.parse(rawInput);

  const membership = await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  // Approval is a control point: any org member may request one, but only
  // an ADMIN/OWNER may resolve it. Otherwise the gate authorizes nothing.
  if (membership.role === "MEMBER") {
    throw new ApprovalApproverNotPermittedError();
  }

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);
  if (existing) return existing;

  const approval = await db.approvalRequest.findFirst({
    where: { id: input.approvalId, organizationId: input.organizationId }
  });

  if (!approval) throw new ApprovalNotFoundError();

  if (approval.status !== "PENDING") {
    throw new ApprovalAlreadyResolvedError();
  }

  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
    await db.approvalRequest.updateMany({
      where: { id: approval.id, status: "PENDING" },
      data: { status: "EXPIRED", resolvedAt: new Date() }
    });
    throw new ApprovalExpiredError();
  }

  if (input.decision === "REJECT") {
    const claimed = await db.approvalRequest.updateMany({
      where: { id: approval.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date() }
    });

    if (claimed.count === 0) throw new ApprovalAlreadyResolvedError();

    await db.actionExecution.create({
      data: {
        organizationId: input.organizationId,
        actionType: "approval.resolve",
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        resourceType: "ApprovalRequest",
        resourceId: approval.id,
        status: "PENDING"
      }
    });

    return readbackAndVerify(input, false);
  }

  const executor = (APPROVABLE_ACTIONS as Record<string, typeof APPROVABLE_ACTIONS[keyof typeof APPROVABLE_ACTIONS]>)[approval.actionType];
  if (!executor) throw new ApprovalVerificationError();

  const claimed = await db.approvalRequest.updateMany({
    where: { id: approval.id, status: "PENDING" },
    data: { status: "APPROVED", resolvedAt: new Date() }
  });

  if (claimed.count === 0) throw new ApprovalAlreadyResolvedError();

  const payload = JSON.parse(approval.payload) as Record<string, unknown>;

  try {
    await executor({
      ...payload,
      actorUserId: approval.requestedById,
      organizationId: input.organizationId,
      idempotencyKey: `approval:${approval.id}`
    });
  } catch (error) {
    // Execution failed after the approval gate opened: revert to PENDING
    // so the approval stays resolvable (retry or reject) instead of
    // getting stuck in APPROVED with no corresponding effect.
    await db.approvalRequest.updateMany({
      where: { id: approval.id, status: "APPROVED" },
      data: { status: "PENDING", resolvedAt: null }
    });
    throw error;
  }

  await db.approvalRequest.update({
    where: { id: approval.id },
    data: { status: "EXECUTED" }
  });

  await db.actionExecution.create({
    data: {
      organizationId: input.organizationId,
      actionType: "approval.resolve",
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
      resourceType: "ApprovalRequest",
      resourceId: approval.id,
      status: "PENDING"
    }
  });

  return readbackAndVerify(input, false);
}
