import { cancelTask, findTaskById } from "@/lib/core/tasks/task.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const taskCancelHandler: ActionHandler = async (envelope) => {
  const taskId = envelope.input.taskId;
  if (typeof taskId !== "string" || !taskId.trim()) throw new Error("taskId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await findTaskById(taskId, organizationId);
  if (!existing) throw new Error("Task not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "task", entityId: taskId }, resultOutcome: "NO_CHANGE", metadata: { taskId }, domainEvents: [], sideEffects: [] };
  }
  await cancelTask(organizationId, taskId);
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "task.cancelled", title: "Görev iptal edildi", body: existing.title, entityType: "Task", entityId: taskId });
  return {
    status: "SUCCESS", entityRef: { entityType: "task", entityId: taskId },
    resultSummary: "task.cancel completed.", metadata: { taskId },
    domainEvents: [], sideEffects: [],
  };
};
