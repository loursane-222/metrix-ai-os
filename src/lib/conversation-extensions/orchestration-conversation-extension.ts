import type { ConversationExtension } from "./conversation-extension-contract";
import { orchestrationHandoff } from "./conversation-extension-handoff";
import { requestOrchestrationPlanAndRun } from "@/lib/executive-orchestration/executive-orchestration-client";

// This extension is registered LAST in active-conversation-extension.ts's
// array on purpose — every other, more specific extension (customer-edit,
// order-management, ...) gets first refusal on an utterance. This one is
// the general-purpose fallback: it only ever sees an utterance that NOTHING
// more specific already handled, so a broad keyword gate is safe here in a
// way it would not be earlier in the array. The gate exists only to avoid
// spending an LLM call on turns that are obviously not an action request at
// all (pure questions, small talk) — the real classification (is this
// actually a real, executable plan against METRIX's own action catalog, or
// unsupported) happens in general-plan-resolver.ts.
const ACTION_VERB_STEM = /olu[şs]tur|ekle|kaydet|haz[ıi]rla|g[öo]nder|kes\b|a[çc]\b|aktar|ta[şs][ıi]|ata\b|planla|g[üu]ncelle|sipari[şs]|teklif|fatura|irsaliye|g[öo]rev|\bstok\b/iu;

export const orchestrationConversationExtension: ConversationExtension = {
  // Not surface-scoped — see payment-reminder-conversation-extension.ts for
  // why this must return a non-null key rather than unconditional null.
  getActiveScopeKey() { return typeof window === "undefined" ? null : `orchestration:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();
    if (!ACTION_VERB_STEM.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const outcome = await requestOrchestrationPlanAndRun(text);

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
