import { submitRepGoalReport } from "@/lib/rep-goals/rep-goals-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { teamHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant keyword pre-gate, mirrors field-visit-conversation-
// extension.ts's precedent — cheap regex check before spending an LLM call.
const REP_GOAL_TRIGGER = /(hedef(?:i)?\s+koy|hedef(?:i)?\s+belirle|hedefini\s+.*yap)/iu;

function targetLabels(report: { visitTargetSet: boolean; salesTargetSet: boolean; collectionTargetSet: boolean }): string {
  const parts: string[] = [];
  if (report.visitTargetSet) parts.push("ziyaret");
  if (report.salesTargetSet) parts.push("satış");
  if (report.collectionTargetSet) parts.push("tahsilat");
  return parts.join(", ");
}

export const repGoalCreateConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `rep-goal-create:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!REP_GOAL_TRIGGER.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await submitRepGoalReport(text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: teamHandoff({ operation: "CREATE", outcomeCode: "REP_GOAL_REPORT_FAILED", resultStatus: "FAILED", failureCode: "REP_GOAL_REPORT_REQUEST_FAILED" }),
      };
    }

    const report = result.data.report;
    // Loose keyword gate — if nothing could actually be extracted, this
    // probably wasn't a real goal-setting message; fall through rather
    // than claiming a turn we can't back with real data.
    if (report.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    if (report.status === "DENIED") {
      return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "REP_GOAL_DENIED", resultStatus: "FAILED", failureCode: "REP_GOAL_ACCESS_DENIED" }) };
    }
    if (report.status === "REP_NOT_FOUND") {
      return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "REP_GOAL_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (report.status === "REP_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "REP_GOAL_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: report.options }) };
    }

    return {
      status: "HANDOFF",
      handoff: teamHandoff({
        operation: "CREATE",
        outcomeCode: "REP_GOAL_SET",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        mutationPerformed: true,
        candidateNames: [`${report.repFullName} için ${targetLabels(report)} hedefi güncellendi`],
      }),
    };
  },
};
