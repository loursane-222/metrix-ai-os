import { reviewRepRequestMessage } from "@/lib/rep-requests/rep-requests-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { orderHandoff, paymentHandoff, quoteHandoff, type ConversationExtensionHandoff } from "./conversation-extension-handoff";
import type { RepRequestDomain } from "@/lib/rep-requests/rep-request.types";

// Two independent checks, mirrors report-review-conversation-extension.ts.
// Does not require "rapor", so it never collides with that extension; does
// not match the propose extensions' approval-request phrasing (which never
// contains "onayla"), so it never collides with them either.
const REP_REQUEST_MENTION = /(sipariş|teklif|tahsilat)/iu;
const REVIEW_DECISION_VERB = /(onayla|kabul\s*et|reddet|revize|d[uü]zelt)/iu;

function handoffBuilder(domain: RepRequestDomain | undefined): (input: Partial<ConversationExtensionHandoff> & Pick<ConversationExtensionHandoff, "operation" | "outcomeCode" | "resultStatus">) => ConversationExtensionHandoff {
  if (domain === "QUOTE") return quoteHandoff;
  if (domain === "PAYMENT") return paymentHandoff;
  return orderHandoff;
}

export const repRequestReviewConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `rep-request-review:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!REP_REQUEST_MENTION.test(text) || !REVIEW_DECISION_VERB.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await reviewRepRequestMessage(text);
    if (!result.ok) {
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_REQUEST_FAILED", resultStatus: "FAILED", failureCode: "REP_REQUEST_REVIEW_REQUEST_FAILED" }) };
    }

    const review = result.data.review;
    // Loose keyword gate — if nothing could actually be extracted, this
    // probably wasn't a real review decision; fall through rather than
    // claiming a turn we can't back with real data.
    if (review.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    const handoff = handoffBuilder(review.status === "DECIDED" ? review.domain : undefined);

    if (review.status === "DENIED") {
      return { status: "HANDOFF", handoff: handoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_DENIED", resultStatus: "FAILED", failureCode: "REP_REQUEST_REVIEW_ACCESS_DENIED" }) };
    }
    if (review.status === "REP_NOT_FOUND") {
      return { status: "HANDOFF", handoff: handoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (review.status === "REP_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: handoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: review.options }) };
    }
    if (review.status === "NO_PENDING_REQUEST") {
      return { status: "HANDOFF", handoff: handoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_NO_PENDING_REQUEST", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND", candidateNames: [`${review.repFullName} için bekleyen talep yok`] }) };
    }
    if (review.status === "CANDIDATE_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: handoff({ operation: "UPDATE", outcomeCode: "REP_REQUEST_REVIEW_CANDIDATE_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: review.options }) };
    }

    return {
      status: "HANDOFF",
      handoff: handoff({
        operation: "UPDATE",
        outcomeCode: review.decision === "APPROVE" ? "REP_REQUEST_REVIEW_APPROVED" : "REP_REQUEST_REVIEW_REJECTED",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        mutationPerformed: true,
        candidateNames: [`${review.repFullName}, ${review.customerNameRaw}`],
      }),
    };
  },
};
