import {
  describeCustomerEditCommandExecutionResult,
  resolveAndDispatchCustomerEditSurfaceCommand,
} from "@/lib/customers/customer-edit-command-integration";
import { getActiveCustomerEditSurfaceDescriptor } from "@/lib/customers/customer-edit-surface-command-channel";

import type { ConversationExtension } from "./conversation-extension-contract";

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
      return {
        status: "HANDLED_FAILED",
        message: `Islem basarisiz: ${error instanceof Error ? error.message : "Bilinmeyen hata."}`,
      };
    }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") {
      return { status: "NOT_HANDLED", message: null };
    }

    const message = describeCustomerEditCommandExecutionResult(result);
    if (result.status === "EXECUTED") {
      return { status: "HANDLED_EXECUTED", message };
    }
    if (result.status === "CLARIFICATION_REQUIRED") {
      return { status: "HANDLED_CLARIFICATION", message };
    }
    return { status: "HANDLED_FAILED", message: message ?? "İşlem tamamlanamadı. Tekrar dener misin?" };
  },
};
