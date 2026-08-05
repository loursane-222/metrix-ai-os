import { createNewTask } from "@/lib/core/tasks/task.service";
import { notify } from "@/lib/core/notifications";
import { createApprovedMemoryItem } from "@/lib/core/memory-items/memory-item.service";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";
import { buildTaskCreatedDomainEvent } from "./task-domain-events";

const OPTIONAL_STRING_FIELDS = ["description", "assigneeUserId"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

/**
 * Reference implementation handler for the Task capability. This is the
 * canonical execution point for "task.create" — the Action Runtime gateway
 * is the only path that reaches here (see task-create-gateway.ts); no other
 * code writes to the Task table.
 *
 * Transaction boundary: createNewTask() (the canonical Prisma write) is the
 * only step whose success determines this handler's SUCCESS/FAILURE. It is
 * classified as the sole CRITICAL side effect. Notification and Executive
 * Memory are classified NON-CRITICAL: they run after the Task row is
 * already committed, and a failure in either one must not (a) roll back or
 * hide the fact that the Task was created, nor (b) be silently swallowed.
 * Each is individually try/caught; a failure is recorded as its own
 * ACTION_RESULT audit entry against the same task entityRef (queryable via
 * auditStore.listByEntity) and surfaced in this handler's returned metadata
 * (notificationDelivered/memoryRecorded), so a caller inspecting the result
 * can see a partial failure even though the overall action reports SUCCESS.
 *
 * This is a deliberate choice, not an oversight: notify()/createApprovedMemoryItem()
 * are called directly and synchronously rather than through
 * domainEvents/sideEffects, because the outbox those descriptors enqueue
 * into has no consumer anywhere in the codebase (verified) — routing a real
 * integration through it would be wiring that looks connected but never
 * executes. domainEvents is still populated below for audit consistency
 * with the rest of the Action Runtime, but it is not what makes Notification
 * or Executive Memory actually happen.
 *
 * Idempotency: task.create shares the durable execution-runtime idempotency
 * authority with every other domain action. A retry using the same trusted
 * scope, key, action, and input hash returns the exact completed result
 * without invoking this handler again, including across serverless runtime
 * instances.
 */
export const taskCreateHandler: ActionHandler = async (envelope) => {
  const title = envelope.input.title;
  if (typeof title !== "string" || !title.trim()) throw new Error("title is required.");

  const values: Record<string, string | undefined> = {};
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = envelope.input[field];
    if (value !== undefined && typeof value !== "string") throw new Error(`${field} must be a string.`);
    values[field] = typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  const rawPriority = envelope.input.priority;
  if (rawPriority !== undefined && !(PRIORITIES as readonly string[]).includes(String(rawPriority))) {
    throw new Error("priority must be LOW, MEDIUM, or HIGH.");
  }
  const rawDueDate = envelope.input.dueDate;
  let dueDate: Date | undefined;
  if (rawDueDate !== undefined) {
    if (typeof rawDueDate !== "string") throw new Error("dueDate must be an ISO date string.");
    dueDate = new Date(rawDueDate);
    if (Number.isNaN(dueDate.getTime())) throw new Error("dueDate must be a valid ISO date string.");
  }

  // CRITICAL side effect — its failure is the handler's failure.
  const task = await createNewTask({
    organizationId: envelope.executionContext.organizationId,
    createdByUserId: envelope.executionContext.actorId,
    title: title.trim(),
    description: values.description,
    assigneeUserId: values.assigneeUserId,
    dueDate,
    ...(rawPriority ? { priority: rawPriority as "LOW" | "MEDIUM" | "HIGH" } : {}),
  });

  const entityRef = { entityType: "task", entityId: task.id };

  // NON-CRITICAL side effect #1 — recorded, never allowed to fail the action.
  let notificationDelivered = true;
  try {
    await notify({
      organizationId: envelope.executionContext.organizationId,
      recipientUserId: task.assigneeUserId ?? envelope.executionContext.actorId,
      type: "task.created",
      title: "Yeni görev oluşturuldu",
      body: task.title,
      severity: task.priority === "HIGH" ? "WARNING" : "INFO",
      entityType: "Task",
      entityId: task.id,
    });
  } catch (cause) {
    notificationDelivered = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "task.create.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { taskId: task.id, critical: false },
    });
  }

  // NON-CRITICAL side effect #2 — recorded, never allowed to fail the action.
  let memoryRecorded = true;
  try {
    await createApprovedMemoryItem({
      organizationId: envelope.executionContext.organizationId,
      createdByUserId: envelope.executionContext.actorId,
      subjectType: "ORGANIZATION",
      type: "FACT",
      key: `task.created.${task.id}`,
      value: `Görev oluşturuldu: "${task.title}"${dueDate ? ` (vade: ${dueDate.toISOString().slice(0, 10)})` : ""}.`,
      source: "EVENT_DERIVED",
      confidence: 0.9,
      isUserConfirmed: false,
      metadata: { taskId: task.id, priority: task.priority },
    });
  } catch (cause) {
    memoryRecorded = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "task.create.memory",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "MEMORY_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Executive Memory write failed.",
      metadata: { taskId: task.id, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "task.create completed.",
    metadata: { taskId: task.id, changedFields: [...Object.keys(envelope.input)], notificationDelivered, memoryRecorded },
    domainEvents: [buildTaskCreatedDomainEvent(task.id, envelope.executionContext.actorId)],
    sideEffects: [],
  };
};
