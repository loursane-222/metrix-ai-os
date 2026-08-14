import { resolveAndDispatchDeliveryEditSurfaceCommand } from "@/lib/deliveries/delivery-edit-command-integration";
import { getActiveDeliveryEditSurfaceDescriptor } from "@/lib/deliveries/delivery-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { deliveryHandoff } from "./conversation-extension-handoff";
export const deliveryEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const descriptor = getActiveDeliveryEditSurfaceDescriptor(); return descriptor ? `delivery-edit:${descriptor.token}:${descriptor.entityId}` : null; },
  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchDeliveryEditSurfaceCommand>>;
    try { result = await resolveAndDispatchDeliveryEditSurfaceCommand(utterance); } catch (error) { return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "UPDATE", outcomeCode: "DELIVERY_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: error instanceof Error ? error.message : "DELIVERY_EDIT_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: result.command.type === "record_exception" || result.command.type === "record_proof" ? "ENRICH" : "UPDATE", outcomeCode: "DELIVERY_EDIT_EXECUTED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "UPDATE", outcomeCode: "DELIVERY_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "UPDATE", outcomeCode: "DELIVERY_EDIT_FAILED", resultStatus: "FAILED", failureCode: `DELIVERY_EDIT_${result.status}` }) };
  },
};
