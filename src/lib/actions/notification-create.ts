import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const NotificationCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  userId: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).max(100),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().max(5000).optional(),
  sourceType: z.string().trim().min(1).max(100).optional(),
  sourceId: z.string().trim().min(1).max(200).optional()
});

export type NotificationCreateInput = z.input<typeof NotificationCreateInputSchema>;

type ParsedInput = z.output<typeof NotificationCreateInputSchema>;

export type VerifiedNotificationCreateResult = {
  action: "notification.create";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  notification: {
    id: string;
    userId: string;
    category: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
    title: string;
    body: string | null;
    sourceType: string | null;
    sourceId: string | null;
    readAt: string | null;
    createdAt: string;
  };
};

export class NotificationRecipientNotFoundError extends Error {
  readonly code = "NOTIFICATION_RECIPIENT_NOT_FOUND";
  constructor() {
    super("Recipient is not a member of the authorized organization");
    this.name = "NotificationRecipientNotFoundError";
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
    userId: input.userId ?? input.actorUserId,
    category: input.category,
    priority: input.priority,
    title: input.title,
    body: input.body ?? null,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function toResult(notification: {
  id: string;
  userId: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: Date | null;
  createdAt: Date;
}, replayed: boolean): VerifiedNotificationCreateResult {
  return {
    action: "notification.create",
    status: "VERIFIED",
    verified: true,
    replayed,
    notification: {
      id: notification.id,
      userId: notification.userId,
      category: notification.category,
      priority: notification.priority,
      title: notification.title,
      body: notification.body,
      sourceType: notification.sourceType,
      sourceId: notification.sourceId,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString()
    }
  };
}

async function readbackAndVerify(
  input: ParsedInput,
  notificationId: string,
  replayed: boolean
): Promise<VerifiedNotificationCreateResult> {
  const notification = await db.notification.findFirst({
    where: { id: notificationId, organizationId: input.organizationId }
  });

  const targetUserId = input.userId ?? input.actorUserId;

  if (!notification || notification.userId !== targetUserId || notification.title !== input.title) {
    throw new NotificationVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "notification.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return toResult(notification, replayed);
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedNotificationCreateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "notification.create",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new NotificationIdempotencyConflictError();

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeNotificationCreate(
  rawInput: NotificationCreateInput
): Promise<VerifiedNotificationCreateResult> {
  const input = NotificationCreateInputSchema.parse(rawInput);

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const targetUserId = input.userId ?? input.actorUserId;

  if (targetUserId !== input.actorUserId) {
    const recipientMembership = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: targetUserId } }
    });
    if (!recipientMembership) throw new NotificationRecipientNotFoundError();
  }

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);
  if (existing) return existing;

  let notificationId: string;

  try {
    const created = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "notification.create",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new NotificationIdempotencyConflictError();
        return { notificationId: raceCheck.resourceId, replayed: true };
      }

      const notification = await tx.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: targetUserId,
          category: input.category,
          priority: input.priority,
          title: input.title,
          body: input.body,
          sourceType: input.sourceType,
          sourceId: input.sourceId
        }
      });

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "notification.create",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Notification",
          resourceId: notification.id,
          status: "PENDING"
        }
      });

      return { notificationId: notification.id, replayed: false };
    });

    notificationId = created.notificationId;

    if (created.replayed) {
      return readbackAndVerify(input, notificationId, true);
    }
  } catch (error) {
    if (error instanceof NotificationIdempotencyConflictError) throw error;
    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerify(input, notificationId, false);
}
