import { resolveAndDispatchCollectionActionEditSurfaceCommand } from "@/lib/collection-actions/collection-action-edit-command-integration";
import { getCollectionActionEditSurfaceDescriptors } from "@/lib/collection-actions/collection-action-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { paymentHandoff } from "./conversation-extension-handoff";

export const collectionActionEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    const ids = getCollectionActionEditSurfaceDescriptors().map((row) => row.entityId).sort();
    return ids.length ? `collection-actions:${ids.join(",")}` : null;
  },
  async execute(utterance) {
    if (/\b\d+(?:[.,]\d+)?\s*(?:tl|₺)\b/iu.test(utterance) && /tahsilat\s+(?:kaydet|işle|uygula)/iu.test(utterance)) {
      return { status: "NOT_HANDLED", handoff: null };
    }
    const result = await resolveAndDispatchCollectionActionEditSurfaceCommand(utterance).catch((error) => ({
      status: "EXECUTION_FAILED" as const,
      error: error instanceof Error ? error.message : "COLLECTION_ACTION_EDIT_FAILED",
    }));
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") {
      return {
        status: "HANDOFF",
        handoff: paymentHandoff({
          operation: "UPDATE",
          outcomeCode: "COLLECTION_ACTION_EDIT_EXECUTED",
          resultStatus: result.command.type === "request" ? "APPROVAL_REQUIRED" : "EXECUTED",
          approvalRequired: result.command.type === "request",
          entityResolution: "RESOLVED",
          mutationPerformed: result.command.type === "confirm",
        }),
      };
    }
    if (result.status === "CLARIFICATION_REQUIRED") {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "UPDATE", outcomeCode: "COLLECTION_ACTION_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    }
    return { status: "HANDOFF", handoff: paymentHandoff({ operation: "UPDATE", outcomeCode: "COLLECTION_ACTION_EDIT_FAILED", resultStatus: "FAILED", failureCode: `COLLECTION_ACTION_EDIT_${result.status}` }) };
  },
};
