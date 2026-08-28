import { completeTask } from "@/lib/core/tasks/task.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

export const taskCompleteHandler: ActionHandler = async (envelope) => {
  const taskId = envelope.input.taskId;
  if (typeof taskId !== "string" || envelope.entityRef?.entityType !== "task" || envelope.entityRef.entityId !== taskId) throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  const task = await completeTask(envelope.executionContext.organizationId, taskId);
  if (!task) return { status: "FAILURE", errorMessage: "Task was not found in this organization." };
  const entityRef = { entityType: "task", entityId: task.id };

  // NON-CRITICAL side effect — the Task is already completed above; a
  // notification failure must not hide that or fail the whole action (same
  // pattern as task-create-handler's own notify/memory side effects).
  let notificationDelivered = true;
  try {
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
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "task.complete.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { taskId: task.id, critical: false },
    });
  }

  return { status: "SUCCESS", entityRef, resultSummary: "task.complete completed.", metadata: { taskId: task.id, notificationDelivered } };
};
