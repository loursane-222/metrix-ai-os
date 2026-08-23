import type { ConversationExtension } from "./conversation-extension-contract";
import { orchestrationHandoff } from "./conversation-extension-handoff";
import { requestPendingApproval, requestOrchestrationApprove } from "@/lib/executive-orchestration/executive-orchestration-client";

// A tight, near-exact phrase gate rather than a loose keyword stem — "evet"
// and "tamam" are common confirmation words other, more specific extensions
// (customer-edit, order-edit, ...) also use for their own pending drafts.
// Registered LAST in active-conversation-extension.ts's array (right after
// orchestration-conversation-extension.ts) so every stateful flow already
// gets first refusal on these words per the array's execution order — this
// extension only ever sees a bare confirmation that nothing more specific
// claimed. It still asks the pending-approval endpoint for real state before
// doing anything, so a stray "evet" with nothing awaiting approval falls
// through as NOT_HANDLED.
const CONFIRMATION_PHRASES = new Set([
  "evet",
  "evet onaylıyorum",
  "evet onayla",
  "evet devam et",
  "onaylıyorum",
  "onayla",
  "onayladım",
  "kabul ediyorum",
  "kabul",
  "devam et",
  "tamam devam et",
  "tamam onaylıyorum",
]);

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase("tr-TR").replace(/[.!?]+$/gu, "");
}

export const orchestrationApprovalConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `orchestration-approval:${window.location.pathname}`; },
  async execute(utterance) {
    if (!CONFIRMATION_PHRASES.has(normalize(utterance))) return { status: "NOT_HANDLED", handoff: null };

    const pending = await requestPendingApproval();
    if (!pending) return { status: "NOT_HANDLED", handoff: null };

    const result = await requestOrchestrationApprove(pending.id);

    if (result.status === "NOT_FOUND") return { status: "NOT_HANDLED", handoff: null };

    if (result.status === "REQUEST_FAILED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "UPDATE",
          outcomeCode: "ORCHESTRATION_APPROVAL_REQUEST_FAILED",
          resultStatus: "FAILED",
          entityResolution: "NOT_REQUIRED",
        }),
      };
    }

    const { orchestration } = result;

    if (orchestration.status === "COMPLETED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "UPDATE",
          outcomeCode: "ORCHESTRATION_APPROVED_AND_COMPLETED",
          resultStatus: "EXECUTED",
          entityResolution: "RESOLVED",
          mutationPerformed: true,
        }),
      };
    }

    if (orchestration.status === "FAILED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "UPDATE",
          outcomeCode: "ORCHESTRATION_APPROVED_BUT_FAILED",
          resultStatus: "FAILED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    // PARTIALLY_COMPLETED — same rationale as
    // orchestration-conversation-extension.ts's own PARTIALLY_COMPLETED
    // branch: no accurate deterministic template exists for this case, so
    // it falls through to this domain's outcomeCode-specific prompt
    // guidance in route.ts.
    return {
      status: "HANDOFF",
      handoff: orchestrationHandoff({
        operation: "UPDATE",
        outcomeCode: "ORCHESTRATION_APPROVED_PARTIALLY_COMPLETED",
        resultStatus: "OBSERVED",
        entityResolution: "RESOLVED",
      }),
    };
  },
};
