import { createNewTask } from "@/lib/core/tasks/task.service";
import { notify } from "@/lib/core/notifications";
import { createApprovedMemoryItem } from "@/lib/core/memory-items/memory-item.service";
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
 * Notification and Executive Memory are called directly and synchronously
 * here rather than through domainEvents/sideEffects: the outbox those
 * descriptors enqueue into has no consumer anywhere in the codebase today
 * (verified — grep for a drain/worker turns up nothing), so routing a real
 * integration through it would be wiring that looks connected but never
 * executes. domainEvents is still populated below for audit consistency
 * with the rest of the Action Runtime, but it is not what makes Notification
 * or Executive Memory actually happen.
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

  const task = await createNewTask({
    organizationId: envelope.executionContext.organizationId,
    createdByUserId: envelope.executionContext.actorId,
    title: title.trim(),
    description: values.description,
    assigneeUserId: values.assigneeUserId,
    dueDate,
    ...(rawPriority ? { priority: rawPriority as "LOW" | "MEDIUM" | "HIGH" } : {}),
  });

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

  return {
    status: "SUCCESS",
    entityRef: { entityType: "task", entityId: task.id },
    resultSummary: "task.create completed.",
    metadata: { taskId: task.id, changedFields: [...Object.keys(envelope.input)] },
    domainEvents: [buildTaskCreatedDomainEvent(task.id, envelope.executionContext.actorId)],
    sideEffects: [],
  };
};
