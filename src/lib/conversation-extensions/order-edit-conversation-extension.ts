import { resolveAndDispatchOrderEditSurfaceCommand } from "@/lib/orders/order-edit-command-integration";
import { getActiveOrderEditSurfaceDescriptor } from "@/lib/orders/order-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { orderHandoff } from "./conversation-extension-handoff";

export const orderEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const descriptor = getActiveOrderEditSurfaceDescriptor(); return descriptor ? `order-edit:${descriptor.token}:${descriptor.entityId}` : null; },
  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchOrderEditSurfaceCommand>>;
    try { result = await resolveAndDispatchOrderEditSurfaceCommand(utterance); } catch (error) { return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "ORDER_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: error instanceof Error ? error.message : "ORDER_EDIT_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: orderHandoff({ operation: result.command.type === "record_exception" ? "ENRICH" : "UPDATE", outcomeCode: "ORDER_EDIT_EXECUTED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "ORDER_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "ORDER_EDIT_FAILED", resultStatus: "FAILED", failureCode: `ORDER_EDIT_${result.status}` }) };
  },
};
