import type { ConversationExtension } from "./conversation-extension-contract";
import { orchestrationHandoff } from "./conversation-extension-handoff";
import { requestOrchestrationQuoteFollowup } from "@/lib/executive-orchestration/executive-orchestration-client";

// Cheap keyword gate before spending an LLM call + a real multi-step
// execution — v1 supports exactly one pattern: teklif hazırlama + takip
// görevi açma (see orchestration-plan-resolver.ts).
const QUOTE_STEM = /teklif/iu;
const PREPARE_STEM = /haz[ıi]rla/iu;
const TASK_STEM = /g[öo]rev/iu;

export const orchestrationConversationExtension: ConversationExtension = {
  // Not surface-scoped — see payment-reminder-conversation-extension.ts for
  // why this must return a non-null key rather than unconditional null.
  getActiveScopeKey() { return typeof window === "undefined" ? null : `orchestration:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();
    if (!QUOTE_STEM.test(text) || !PREPARE_STEM.test(text) || !TASK_STEM.test(text)) {
      return { status: "NOT_HANDLED", handoff: null };
    }

    const outcome = await requestOrchestrationQuoteFollowup(text);

    if (outcome.status === "NOT_HANDLED") return { status: "NOT_HANDLED", handoff: null };

    if (outcome.status === "CLARIFICATION_REQUIRED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "QUERY",
          outcomeCode: "ORCHESTRATION_CLARIFICATION_NEEDED",
          resultStatus: "CLARIFICATION_REQUIRED",
          entityResolution: "UNKNOWN",
        }),
      };
    }

    if (outcome.status === "REQUEST_FAILED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_REQUEST_FAILED",
          resultStatus: "FAILED",
          entityResolution: "NOT_REQUIRED",
        }),
      };
    }

    const { orchestration } = outcome;

    if (orchestration.status === "COMPLETED") {
      // resultStatus EXECUTED + mutationPerformed already produces an
      // accurate deterministic confirmation ("İşlemi tamamladım.") — no
      // custom prompt guidance needed for this branch.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_COMPLETED",
          resultStatus: "EXECUTED",
          entityResolution: "RESOLVED",
          mutationPerformed: true,
        }),
      };
    }

    if (orchestration.status === "FAILED") {
      // resultStatus FAILED already produces an accurate, generic
      // deterministic message — no custom prompt guidance needed.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_FAILED",
          resultStatus: "FAILED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    // PARTIALLY_COMPLETED has no accurate deterministic template
    // (buildUniversalHandoffMessage only knows full success or full
    // failure) — resultStatus OBSERVED + empty candidateNames deliberately
    // falls through to null there, so the model instead follows this
    // domain's own outcomeCode-specific prompt guidance in route.ts.
    return {
      status: "HANDOFF",
      handoff: orchestrationHandoff({
        operation: "CREATE",
        outcomeCode: "ORCHESTRATION_PARTIALLY_COMPLETED",
        resultStatus: "OBSERVED",
        entityResolution: "RESOLVED",
      }),
    };
  },
};
