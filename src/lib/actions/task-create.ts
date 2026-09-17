import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

const TaskCreateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(500),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM"),
  dueAt: z.string().datetime({ offset: true }).optional()
});

export type TaskCreateInput =
  z.input<typeof TaskCreateInputSchema>;

export type VerifiedTaskCreateResult = {
  action: "task.create";
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
    assignedToUserId: string | null;
  };
};

export class IdempotencyConflictError
  extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "Idempotency key was already used with different input"
    );
    this.name = "IdempotencyConflictError";
  }
}

export class ActionVerificationError
  extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";

  constructor() {
    super("Action could not be verified by readback");
    this.name = "ActionVerificationError";
  }
}

type ParsedInput = z.output<
  typeof TaskCreateInputSchema
>;

function requestHash(
  input: ParsedInput
): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    title: input.title,
    priority: input.priority,
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
  resourceId: string,
  replayed: boolean
): Promise<VerifiedTaskCreateResult> {
  const task = await db.task.findFirst({
    where: {
      id: resourceId,
      organizationId: input.organizationId
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      priority: true,
      status: true,
      dueAt: true,
      assignedToUserId: true
    }
  });

  if (!task) {
    throw new ActionVerificationError();
  }

  const expectedDueAt =
    input.dueAt === undefined
      ? null
      : new Date(input.dueAt).toISOString();

  const actualDueAt =
    task.dueAt?.toISOString() ?? null;

  if (
    task.organizationId !== input.organizationId ||
    task.title !== input.title ||
    task.priority !== input.priority ||
    task.status !== "OPEN" ||
    actualDueAt !== expectedDueAt ||
    // No explicit-assignee input exists yet, so a freshly created task
    // must always be self-assigned to its creating actor — this is the
    // canonical rule "görevlerim"/assignedToMe relies on to ever find a
    // task the actor just created (see task-list.ts's assignedToMe
    // filter). Verified by readback exactly like every other field.
    task.assignedToUserId !== input.actorUserId
  ) {
    throw new ActionVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "task.create",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  return {
    action: "task.create",
    status: "VERIFIED",
    verified: true,
    replayed,
    task: {
      id: task.id,
      organizationId: task.organizationId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: actualDueAt,
      assignedToUserId: task.assignedToUserId
    }
  };
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedTaskCreateResult | null> {
  const existing =
    await db.actionExecution.findUnique({
      where: {
        organizationId_actionType_idempotencyKey: {
          organizationId: input.organizationId,
          actionType: "task.create",
          idempotencyKey: input.idempotencyKey
        }
      }
    });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== hash) {
    throw new IdempotencyConflictError();
  }

  return readbackAndVerify(
    input,
    existing.resourceId,
    true
  );
}

export async function executeTaskCreate(
  rawInput: TaskCreateInput
): Promise<VerifiedTaskCreateResult> {
  const input =
    TaskCreateInputSchema.parse(rawInput);

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

  let resourceId: string;

  try {
    const created =
      await db.$transaction(async (tx) => {
        const raceCheck =
          await tx.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId:
                  input.organizationId,
                actionType: "task.create",
                idempotencyKey:
                  input.idempotencyKey
              }
            }
          });

        if (raceCheck) {
          if (raceCheck.requestHash !== hash) {
            throw new IdempotencyConflictError();
          }

          return {
            resourceId: raceCheck.resourceId,
            replayed: true
          };
        }

        const task = await tx.task.create({
          data: {
            organizationId:
              input.organizationId,
            title: input.title,
            priority: input.priority,
            dueAt:
              input.dueAt === undefined
                ? null
                : new Date(input.dueAt),
            createdByUserId:
              input.actorUserId,
            // No explicit-assignee input exists yet — a task created
            // without one defaults to its creating actor, so
            // task_list's assignedToMe filter ("görevlerim") finds it.
            // createdByUserId still separately records who created it.
            assignedToUserId:
              input.actorUserId
          }
        });

        await tx.actionExecution.create({
          data: {
            organizationId:
              input.organizationId,
            actionType: "task.create",
            idempotencyKey:
              input.idempotencyKey,
            requestHash: hash,
            resourceType: "Task",
            resourceId: task.id,
            status: "PENDING"
          }
        });

        return {
          resourceId: task.id,
          replayed: false
        };
      });

    resourceId = created.resourceId;

    if (created.replayed) {
      return readbackAndVerify(
        input,
        resourceId,
        true
      );
    }
  } catch (error) {
    if (
      error instanceof IdempotencyConflictError
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

  return readbackAndVerify(
    input,
    resourceId,
    false
  );
}
