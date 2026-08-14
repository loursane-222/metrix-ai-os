import { resolveAndDispatchTaskEditSurfaceCommand } from "@/lib/tasks/task-edit-command-integration";
import { getActiveTaskEditSurfaceDescriptor } from "@/lib/tasks/task-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { taskHandoff } from "./conversation-extension-handoff";

export const taskEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const descriptor = getActiveTaskEditSurfaceDescriptor(); return descriptor ? `task-edit:${descriptor.token}:${descriptor.entityId}` : null; },
  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchTaskEditSurfaceCommand>>;
    try { result = await resolveAndDispatchTaskEditSurfaceCommand(utterance); } catch (error) { return { status: "HANDOFF", handoff: taskHandoff({ operation: "UPDATE", outcomeCode: "TASK_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: error instanceof Error ? error.message : "TASK_EDIT_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: taskHandoff({ operation: "UPDATE", outcomeCode: "TASK_EDIT_EXECUTED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: taskHandoff({ operation: "UPDATE", outcomeCode: "TASK_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: taskHandoff({ operation: "UPDATE", outcomeCode: "TASK_EDIT_FAILED", resultStatus: "FAILED", failureCode: `TASK_EDIT_${result.status}` }) };
  },
};
