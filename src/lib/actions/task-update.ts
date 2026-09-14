import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

const TaskUpdateInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1),
    organizationId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(128),
    taskId: z.string().trim().min(1),
    status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    dueAt: z.string().datetime({ offset: true }).optional()
  })
  .refine(
    input =>
      input.status !== undefined ||
      input.priority !== undefined ||
      input.dueAt !== undefined,
    {
      message: "At least one mutable field is required"
    }
  );

export type TaskUpdateInput =
  z.input<typeof TaskUpdateInputSchema>;

export type VerifiedTaskUpdateResult = {
  action: "task.update";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  task: {
    id: string;
    organizationId: string;
    title: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
    status: "OPEN" | "DONE" | "CANCELLED";
    dueAt: string | null;
  };
};

export class TaskUpdateIdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name = "TaskUpdateIdempotencyConflictError";
  }
}

export class TaskUpdateVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "TaskUpdateVerificationError";
  }
}

export class TaskNotFoundError
  extends Error {
  readonly code = "TASK_NOT_FOUND";

  constructor() {
    super(
      "Task was not found in the authorized organization"
    );
    this.name = "TaskNotFoundError";
  }
}

type ParsedInput = z.output<
  typeof TaskUpdateInputSchema
>;

function requestHash(
  input: ParsedInput
): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    taskId: input.taskId,
    status: input.status ?? null,
    priority: input.priority ?? null,
    dueAt: input.dueAt ?? null
  });

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

function isUniqueConflict(
  error: unknown
): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return false;
  }

  return (
    (error as { code?: string }).code === "P2002"
  );
}

async function readbackAndVerify(
  input: ParsedInput,
  replayed: boolean
): Promise<VerifiedTaskUpdateResult> {
  const task = await db.task.findFirst({
    where: {
      id: input.taskId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      priority: true,
      status: true,
      dueAt: true
    }
  });

  if (!task) {
    throw new TaskUpdateVerificationError();
  }

  const actualDueAt =
    task.dueAt?.toISOString() ?? null;

  if (
    task.organizationId !== input.organizationId ||
    (input.status !== undefined &&
      task.status !== input.status) ||
    (input.priority !== undefined &&
      task.priority !== input.priority) ||
    (input.dueAt !== undefined &&
      actualDueAt !==
        new Date(input.dueAt).toISOString())
  ) {
    throw new TaskUpdateVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "task.update",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "task.update",
    status: "VERIFIED",
    verified: true,
    replayed,
    task: {
      id: task.id,
      organizationId: task.organizationId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: actualDueAt
    }
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedTaskUpdateResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "task.update",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new TaskUpdateIdempotencyConflictError();
  }

  return readbackAndVerify(input, true);
}

export async function executeTaskUpdate(
  rawInput: TaskUpdateInput
): Promise<VerifiedTaskUpdateResult> {
  const input =
    TaskUpdateInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const hash = requestHash(input);

  const existing =
    await resolveExisting(input, hash);

  if (existing) {
    return existing;
  }

  try {
    const outcome =
      await db.$transaction(async (tx) => {
        const raceCheck =
          await tx.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId:
                  input.organizationId,
                actionType: "task.update",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new TaskUpdateIdempotencyConflictError();
          }

          return { replayed: true };
        }

        const target = await tx.task.findFirst({
          where: {
            id: input.taskId,
            organizationId: input.organizationId
          },
          select: { id: true }
        });

        if (!target) {
          throw new TaskNotFoundError();
        }

        await tx.task.update({
          where: {
            id: target.id
          },
          data: {
            ...(input.status !== undefined
              ? { status: input.status }
              : {}),
            ...(input.priority !== undefined
              ? { priority: input.priority }
              : {}),
            ...(input.dueAt !== undefined
              ? { dueAt: new Date(input.dueAt) }
              : {})
          }
        });

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType: "task.update",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Task",
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
      error instanceof TaskUpdateIdempotencyConflictError ||
      error instanceof TaskNotFoundError
    ) {
      throw error;
    }

    if (!isUniqueConflict(error)) {
      throw error;
    }

    const raced =
      await resolveExisting(input, hash);

    if (!raced) {
      throw error;
    }

    return raced;
  }

  return readbackAndVerify(input, false);
}
