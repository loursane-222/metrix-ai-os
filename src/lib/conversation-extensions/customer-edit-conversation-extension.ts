import { resolveAndDispatchCustomerEditSurfaceCommand } from "@/lib/customers/customer-edit-command-integration";
import { getActiveCustomerEditSurfaceDescriptor } from "@/lib/customers/customer-edit-surface-command-channel";

import type { ConversationExtension } from "./conversation-extension-contract";
import { customerHandoff } from "./conversation-extension-handoff";

export const customerEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    const descriptor = getActiveCustomerEditSurfaceDescriptor();
    return descriptor ? `customer-edit:${descriptor.token}:${descriptor.entityId}` : null;
  },

  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchCustomerEditSurfaceCommand>>;
    try {
      result = await resolveAndDispatchCustomerEditSurfaceCommand(utterance);
    } catch (error) {
      void error;
      return {
        status: "HANDOFF",
        handoff: customerHandoff({ operation: "UPDATE", outcomeCode: "CUSTOMER_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "CUSTOMER_EDIT_EXECUTION_FAILED" }),
      };
    }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") {
      return { status: "NOT_HANDLED", handoff: null };
    }

    if (result.status === "EXECUTED") {
      const command = result.command;
      const fieldName = (command.type === "set_field" || command.type === "clear_field" || command.type === "revert_field") && command.field.kind === "top" ? command.field.field : null;
      return {
        status: "HANDOFF",
        handoff: customerHandoff({
          operation: "UPDATE",
          outcomeCode: result.command.type === "commit" ? "CUSTOMER_EDIT_COMMITTED" : "CUSTOMER_EDIT_EXECUTED",
          resultStatus: "EXECUTED",
          mutationPerformed: true,
          ...(fieldName ? { fieldNames: [fieldName] } : {}),
        }),
      };
    }
    if (result.status === "CLARIFICATION_REQUIRED") {
      return { status: "HANDOFF", handoff: customerHandoff({ operation: "UPDATE", outcomeCode: "CUSTOMER_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    }
    return { status: "HANDOFF", handoff: customerHandoff({ operation: "UPDATE", outcomeCode: "CUSTOMER_EDIT_FAILED", resultStatus: "FAILED", failureCode: "CUSTOMER_EDIT_FAILED" }) };
  },
};
