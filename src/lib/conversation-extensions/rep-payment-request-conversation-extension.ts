import { proposeRepRequestMessage } from "@/lib/rep-requests/rep-requests-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { paymentHandoff } from "./conversation-extension-handoff";

// See rep-order-request-conversation-extension.ts for the trigger design
// rationale (two independent checks, no "onayla" overlap with the review
// extension's decision verb).
const PAYMENT_MENTION = /tahsilat/iu;
const APPROVAL_REQUEST_PHRASE = /onay\S*\s+(g[oö]nder|ist|bekl|al|sun)/iu;

export const repPaymentRequestConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `rep-payment-request:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!PAYMENT_MENTION.test(text) || !APPROVAL_REQUEST_PHRASE.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await proposeRepRequestMessage("PAYMENT", text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "REP_PAYMENT_REQUEST_FAILED", resultStatus: "FAILED", failureCode: "REP_PAYMENT_REQUEST_REQUEST_FAILED" }),
      };
    }

    const report = result.data.report;
    if (report.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    if (report.status === "CUSTOMER_NOT_FOUND") {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "REP_PAYMENT_REQUEST_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (report.status === "CUSTOMER_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: paymentHandoff({ operation: "CREATE", outcomeCode: "REP_PAYMENT_REQUEST_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: report.options }) };
    }

    return {
      status: "HANDOFF",
      handoff: paymentHandoff({
        operation: "CREATE",
        outcomeCode: "REP_PAYMENT_REQUEST_PROPOSED",
        resultStatus: "APPROVAL_REQUIRED",
        entityResolution: "RESOLVED",
        approvalRequired: true,
        candidateNames: [`Tahsilat talebi, ${report.customerNameRaw}`],
      }),
    };
  },
};
