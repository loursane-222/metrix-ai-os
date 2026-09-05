import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import type { ConversationExtension } from "./conversation-extension-contract";
import { customerHandoff } from "./conversation-extension-handoff";

/**
 * Residual Capability Parity Migration: extracted verbatim from
 * customer-management-conversation-extension.ts's own "attachment" stage
 * (now retired, along with every other stage of that coordinator — see
 * conversation-extension-ownership-registry.ts's header). This is the ONE
 * stage that could not become a stateless Executive Agent tool: it drives
 * an already-uploaded document's extraction/duplicate-review/apply/commit
 * workflow, bound to a live, mounted "customer create" Workspace surface
 * (customer-create-surface-command-channel.ts) and a browser-session
 * attachment reference (attachment-session.ts) — genuinely stateful,
 * multi-turn UI orchestration, not a single canonical action call.
 *
 * CANONICAL_CONTINUATION_APPROVAL fits its real shape: every branch except
 * the bare NOT_ATTACHMENT_INTENT fallback requires a pre-existing browser-
 * session anchor (an uploaded attachment reference, or an already-started
 * extraction preview) — it never originates a genuinely cold business
 * intent with nothing already pending, and a "nothing pending" turn always
 * falls through as NOT_HANDLED (see customerAttachmentConversationCoordinator.execute's
 * own !state.preview branch). The coordinator itself is untouched — same
 * file, same logic, same duplicate-detection/apply/commit calls — only the
 * ConversationExtension wrapper (getActiveScopeKey/execute -> {status,
 * handoff}) is new.
 */
export const customerDocumentAttachmentConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `customer-document-attachment:${window.location.pathname}`;
  },
  async execute(utterance) {
    const result = await customerAttachmentConversationCoordinator.execute(utterance);
    if (!result.handled) return { status: "NOT_HANDLED", handoff: null };
    const clarification = result.outcome === "CLARIFICATION_REQUIRED";
    return {
      status: "HANDOFF",
      handoff: customerHandoff({
        operation: "ATTACHMENT",
        outcomeCode: clarification
          ? result.candidateNames?.length ? "ATTACHMENT_NOTIFY_AMBIGUOUS" : "ATTACHMENT_NOTIFY_TARGET_REQUIRED"
          : result.outcome === "NOTIFY" ? "ATTACHMENT_NOTIFY_DELIVERED" : "ATTACHMENT_EXECUTED",
        resultStatus: clarification ? "CLARIFICATION_REQUIRED" : "EXECUTED",
        entityResolution: clarification ? (result.candidateNames?.length ? "AMBIGUOUS" : "NOT_FOUND") : "RESOLVED",
        candidateNames: result.candidateNames ?? [],
        mutationPerformed: result.outcome === "NOTIFY",
      }),
    };
  },
  reset() {
    customerAttachmentConversationCoordinator.reset();
  },
};
