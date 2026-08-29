import { proposeRepRequestMessage } from "@/lib/rep-requests/rep-requests-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { orderHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant, two independent checks (domain word + an explicit
// approval-request phrase) — mirrors report-review-conversation-
// extension.ts's fix for the same "words apart, not adjacent" problem.
// The approval phrase deliberately never contains "onayla" (the imperative
// APPROVE verb) so this can never collide with a manager's later decision
// message ("Ahmet'in siparişini onayla").
const ORDER_MENTION = /sipariş/iu;
// Verb STEMS, not full words — Turkish suffixing changes the tail
// ("onay istiyorum", "onayına sun", "onaya gönderiyorum") while these
// stems stay intact (istemek/beklemek both elide their final vowel under
// -Iyor, e.g. "istiyorum" — matching "ist"/"bekl" catches that too).
const APPROVAL_REQUEST_PHRASE = /onay\S*\s+(g[oö]nder|ist|bekl|al|sun)/iu;

export const repOrderRequestConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `rep-order-request:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!ORDER_MENTION.test(text) || !APPROVAL_REQUEST_PHRASE.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await proposeRepRequestMessage("ORDER", text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: orderHandoff({ operation: "CREATE", outcomeCode: "REP_ORDER_REQUEST_FAILED", resultStatus: "FAILED", failureCode: "REP_ORDER_REQUEST_REQUEST_FAILED" }),
      };
    }

    const report = result.data.report;
    if (report.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    if (report.status === "CUSTOMER_NOT_FOUND") {
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "REP_ORDER_REQUEST_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
    }
    if (report.status === "CUSTOMER_AMBIGUOUS") {
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "REP_ORDER_REQUEST_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: report.options }) };
    }

    return {
      status: "HANDOFF",
      handoff: orderHandoff({
        operation: "CREATE",
        outcomeCode: "REP_ORDER_REQUEST_PROPOSED",
        resultStatus: "APPROVAL_REQUIRED",
        entityResolution: "RESOLVED",
        approvalRequired: true,
        candidateNames: [`Sipariş talebi, ${report.customerNameRaw}`],
      }),
    };
  },
};
