import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const NotificationMarkReadInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  notificationId: z.string().trim().min(1)
});

export type NotificationMarkReadInput = z.input<typeof NotificationMarkReadInputSchema>;

type ParsedInput = z.output<typeof NotificationMarkReadInputSchema>;

export type VerifiedNotificationMarkReadResult = {
  action: "notification.mark_read";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  notification: {
    id: string;
    readAt: string;
  };
};

export class NotificationNotFoundError extends Error {
  readonly code = "NOTIFICATION_NOT_FOUND";
  constructor() {
    super("Notification was not found for the authorized user");
    this.name = "NotificationNotFoundError";
  }
}

export class NotificationIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "NotificationIdempotencyConflictError";
  }
}

export class NotificationVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";
  constructor() {
    super("Action could not be verified by readback");
    this.name = "NotificationVerificationError";
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
    notificationId: input.notificationId
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedNotificationMarkReadResult> {
  const notification = await db.notification.findFirst({
    where: { id: input.notificationId, organizationId: input.organizationId, userId: input.actorUserId }
  });

  if (!notification || !notification.readAt) {
    throw new NotificationVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "notification.mark_read",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return {
    action: "notification.mark_read",
    status: "VERIFIED",
    verified: true,
    replayed,
    notification: { id: notification.id, readAt: notification.readAt.toISOString() }
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedNotificationMarkReadResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "notification.mark_read",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new NotificationIdempotencyConflictError();

  return readbackAndVerify(input, true);
}

export async function executeNotificationMarkRead(
  rawInput: NotificationMarkReadInput
): Promise<VerifiedNotificationMarkReadResult> {
  const input = NotificationMarkReadInputSchema.parse(rawInput);

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);
  if (existing) return existing;

  try {
    const outcome = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "notification.mark_read",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new NotificationIdempotencyConflictError();
        return { replayed: true };
      }

      // Only the recipient may mark their own notification read, even
      // though other org members might otherwise have tenant access.
      const target = await tx.notification.findFirst({
        where: { id: input.notificationId, organizationId: input.organizationId, userId: input.actorUserId },
        select: { id: true, readAt: true }
      });

      if (!target) throw new NotificationNotFoundError();

      if (!target.readAt) {
        await tx.notification.update({
          where: { id: target.id },
          data: { readAt: new Date() }
        });
      }

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "notification.mark_read",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Notification",
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
      error instanceof NotificationIdempotencyConflictError ||
      error instanceof NotificationNotFoundError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerify(input, false);
}
