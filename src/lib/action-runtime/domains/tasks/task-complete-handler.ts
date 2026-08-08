import { completeTask } from "@/lib/core/tasks/task.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const taskCompleteHandler: ActionHandler = async (envelope) => {
  const taskId = envelope.input.taskId;
  if (typeof taskId !== "string" || envelope.entityRef?.entityType !== "task" || envelope.entityRef.entityId !== taskId) throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  const task = await completeTask(envelope.executionContext.organizationId, taskId);
  if (!task) return { status: "FAILURE", errorMessage: "Task was not found in this organization." };
  await notifyWithOwnerFanout({
    organizationId: envelope.executionContext.organizationId,
    actorUserId: envelope.executionContext.actorId,
    recipientUserId: task.createdByUserId ?? undefined,
    type: "task.completed",
    title: "Görev tamamlandı",
    body: task.title,
    entityType: "Task",
    entityId: task.id,
  });
  return { status: "SUCCESS", entityRef: { entityType: "task", entityId: task.id }, resultSummary: "task.complete completed." };
};
