import { submitReportReviewMessage } from "@/lib/reports/reports-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant keyword pre-gate, mirrors field-visit-conversation-
// extension.ts's precedent — cheap regex check before spending an LLM call.
// Two independent checks rather than one contiguous phrase: a real message
// like "raporu eksik, revize iste" has other words between "rapor" and the
// decision verb, so a single adjacent-phrase regex would miss it.
const REPORT_MENTION = /rapor/iu;
const REVIEW_DECISION_VERB = /(onayla|kabul\s*et|reddet|revize|d[uü]zelt)/iu;

export const reportReviewConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `report-review:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!REPORT_MENTION.test(text) || !REVIEW_DECISION_VERB.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await submitReportReviewMessage(text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_REVIEW_REQUEST_FAILED", resultStatus: "FAILED", failureCode: "REPORT_REVIEW_REQUEST_FAILED" }),
      };
    }

    const review = result.data.review;
    // Loose keyword gate — if nothing could actually be extracted, this
    // probably wasn't a real review decision; fall through rather than
    // claiming a turn we can't back with real data.
    if (review.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    if (review.status === "DENIED") {
      return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_REVIEW_DENIED", resultStatus: "FAILED", failureCode: "REPORT_REVIEW_ACCESS_DENIED" }) };
    }
    if (review.status === "REP_NOT_FOUND") {
      return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_REVIEW_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (review.status === "REP_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_REVIEW_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: review.options }) };
    }
    if (review.status === "NO_PENDING_SUBMISSION") {
      return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_REVIEW_NO_PENDING_SUBMISSION", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND", candidateNames: [`${review.repFullName} için bekleyen rapor yok`] }) };
    }

    return {
      status: "HANDOFF",
      handoff: companyHandoff({
        operation: "UPDATE",
        outcomeCode: review.decision === "APPROVED" ? "REPORT_REVIEW_APPROVED" : "REPORT_REVIEW_NEEDS_REVISION",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        mutationPerformed: true,
        candidateNames: [`${review.repFullName}, ${review.templateName}`],
      }),
    };
  },
};
