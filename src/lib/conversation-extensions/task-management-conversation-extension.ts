import { extractObviousTaskCreatePlan, type TaskCreatePendingContext } from "@/lib/tasks/task-create-conversation-planner";
import { taskCreateConversationCoordinator, resetTaskManagementConversationForTests } from "@/lib/tasks/task-create-conversation-coordinator";
import type { ConversationExtension } from "./conversation-extension-contract";
import { taskHandoff } from "./conversation-extension-handoff";

export const taskManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `tasks-management:${window.location.pathname}`;
  },
  async execute(utterance, source = "written") {
    const createState = taskCreateConversationCoordinator.store.get();
    const pendingContext: TaskCreatePendingContext = ["OPENING", "COLLECTING", "READY"].includes(createState.lifecycle)
      ? { lifecycle: createState.lifecycle as NonNullable<TaskCreatePendingContext>["lifecycle"], fields: createState.fields }
      : null;
    // Same veto-narrowing as customer-management-conversation-extension.ts:
    // the local gate may only skip the coordinator when no operation is
    // already pending. Once pending, the coordinator's real planner is the
    // sole interpreter of every continuation turn — see
    // METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md §0/§4.
    const ownership = extractObviousTaskCreatePlan(utterance, pendingContext);
    if (!pendingContext && ownership.kind === "NOT_TASK_CREATE") return { status: "NOT_HANDLED", handoff: null };

    try {
      const createResult = await taskCreateConversationCoordinator.execute(utterance, source);
      if (!createResult.handled) return { status: "NOT_HANDLED", handoff: null };
      return {
        status: "HANDOFF",
        handoff: taskHandoff({
          operationId: createResult.operationId,
          operation: createResult.operation,
          outcomeCode: createResult.outcomeCode,
          resultStatus: createResult.status === "FAILED" ? "FAILED" : createResult.status === "CLARIFICATION" ? "CLARIFICATION_REQUIRED" : "EXECUTED",
          fieldNames: createResult.fieldNames,
          mutationPerformed: createResult.mutationPerformed,
          navigationRequested: createResult.navigationRequested,
          navigationStatus: safeNavigationStatus(createResult.navigationStatus),
          failureCode: createResult.failureCode,
          entityId: createResult.createdTaskId ?? null,
        }),
      };
    } catch (cause: unknown) {
      console.error("[TaskManagementExtension] operation failed", cause);
      return { status: "HANDOFF", handoff: taskHandoff({ operation: "UNKNOWN", outcomeCode: "TASK_EXTENSION_FAILED", resultStatus: "FAILED", failureCode: "UNKNOWN_NAVIGATION_FAILURE" }) };
    }
  },
  reset() { resetTaskManagementConversationForTests(); },
};

function safeNavigationStatus(value: string): "NOT_REQUESTED" | "COMPLETED" | "FAILED" | "EXPIRED" | "UNKNOWN" {
  return value === "COMPLETED" || value === "FAILED" || value === "EXPIRED" || value === "NOT_REQUESTED" ? value : "UNKNOWN";
}
