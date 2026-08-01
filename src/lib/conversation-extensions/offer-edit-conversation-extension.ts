import { resolveAndDispatchOfferEditSurfaceCommand } from "@/lib/offers/offer-edit-command-integration";
import { getActiveOfferEditSurfaceDescriptor } from "@/lib/offers/offer-edit-surface-command-channel";

import type { ConversationExtension } from "./conversation-extension-contract";
import { quoteHandoff } from "./conversation-extension-handoff";

export const offerEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    const descriptor = getActiveOfferEditSurfaceDescriptor();
    return descriptor ? `offer-edit:${descriptor.token}:${descriptor.entityId}` : null;
  },

  async execute(utterance) {
    let result: Awaited<ReturnType<typeof resolveAndDispatchOfferEditSurfaceCommand>>;
    try {
      result = await resolveAndDispatchOfferEditSurfaceCommand(utterance);
    } catch (error) {
      return {
        status: "HANDOFF",
        handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: editFailureCode({ status: "EXECUTION_FAILED", error: error instanceof Error ? error.message : String(error) }) }),
      };
    }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") {
      return { status: "NOT_HANDLED", handoff: null };
    }

    if (result.status === "EXECUTED") {
      const command = result.command;
      const fieldNames = command.type === "set_field" ? [command.field] : command.type === "set_general_discount" ? ["generalDiscountPercent"] : command.type === "add_item" || command.type === "remove_last_item" || command.type === "set_item_price" ? ["items"] : [];
      return {
        status: "HANDOFF",
        handoff: quoteHandoff({
          operation: "UPDATE",
          outcomeCode: command.type === "commit" ? "OFFER_EDIT_COMMITTED" : "OFFER_EDIT_EXECUTED",
          resultStatus: "EXECUTED",
          mutationPerformed: true,
          fieldNames,
        }),
      };
    }
    if (result.status === "CLARIFICATION_REQUIRED") {
      return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    }
    return { status: "HANDOFF", handoff: quoteHandoff({ operation: "UPDATE", outcomeCode: "OFFER_EDIT_FAILED", resultStatus: "FAILED", failureCode: editFailureCode(result) }) };
  },
};

function editFailureCode(result: { status: string; error?: string }): string {
  if (result.status !== "EXECUTION_FAILED" || !result.error) return `OFFER_EDIT_${result.status}`;
  if (result.error.includes("baseVersion")) return "OFFER_EDIT_VERSION_MISMATCH";
  if (result.error.includes("draft targets")) return "OFFER_EDIT_ENTITY_MISMATCH";
  if (result.error.includes("active page context; none exists")) return "OFFER_EDIT_CONTEXT_MISMATCH";
  if (result.error.includes("was not found")) return "OFFER_EDIT_DRAFT_NOT_FOUND";
  const sanitized = result.error.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return sanitized ? `ERR_${sanitized}` : "OFFER_EDIT_EXECUTION_FAILED";
}
