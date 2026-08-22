import type { ConversationExtension } from "./conversation-extension-contract";
import { communicationHandoff } from "./conversation-extension-handoff";
import { requestPaymentReminder } from "@/lib/executive-communication/executive-communication-client";

// Cheap keyword gate before spending an LLM call + a real outbound email —
// avoids firing the trigger resolver on utterances that obviously aren't
// this request (e.g. "tahsilat listesini göster").
const BALANCE_STEM = /tahsilat|ödeme/iu;
const REMINDER_STEM = /hat[ıi]rlat/iu;
const SEND_STEM = /g[öo]nder/iu;

export const paymentReminderConversationExtension: ConversationExtension = {
  // Not surface-scoped (works from any page, like customer-management's
  // deictic commands) — must still return a non-null key so
  // executeActiveConversationExtension's `getActiveScopeKey() !== null`
  // filter includes it in the active set; unconditional null is treated as
  // "never active" and would silently exclude this extension entirely.
  getActiveScopeKey() { return typeof window === "undefined" ? null : `payment-reminder:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();
    if (!BALANCE_STEM.test(text) || !REMINDER_STEM.test(text) || !SEND_STEM.test(text)) {
      return { status: "NOT_HANDLED", handoff: null };
    }

    const outcome = await requestPaymentReminder(text);

    if (outcome.status === "NOT_HANDLED") return { status: "NOT_HANDLED", handoff: null };

    if (outcome.status === "CLARIFICATION_NEEDED") {
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "QUERY",
          outcomeCode: "PAYMENT_REMINDER_CLARIFICATION_NEEDED",
          resultStatus: "CLARIFICATION_REQUIRED",
          entityResolution: outcome.candidateNames.length > 0 ? "AMBIGUOUS" : "NOT_FOUND",
          candidateNames: outcome.candidateNames,
        }),
      };
    }

    if (outcome.status === "NO_OUTSTANDING_BALANCE") {
      // resultStatus OBSERVED + empty candidateNames deliberately falls
      // through buildUniversalHandoffMessage's deterministic templates
      // (conversation-extension-handoff-message.ts) to null — that function
      // wins over any model narration whenever it returns non-null, so this
      // is the only combination that reaches this domain's own
      // outcomeCode-specific prompt guidance in route.ts instead of a
      // generic "Kanonik kayıtlara göre: <name>." line.
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "QUERY",
          outcomeCode: "PAYMENT_REMINDER_NO_OUTSTANDING_BALANCE",
          resultStatus: "OBSERVED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    if (outcome.status === "SEND_FAILED") {
      // resultStatus FAILED already produces an accurate, generic
      // deterministic message ("couldn't complete this, try again?") — no
      // custom prompt guidance needed for this branch.
      return {
        status: "HANDOFF",
        handoff: communicationHandoff({
          operation: "CREATE",
          outcomeCode: "PAYMENT_REMINDER_SEND_FAILED",
          resultStatus: "FAILED",
          entityResolution: outcome.customerName ? "RESOLVED" : "NOT_FOUND",
          candidateNames: outcome.customerName ? [outcome.customerName] : [],
        }),
      };
    }

    // resultStatus EXECUTED + mutationPerformed already produces an
    // accurate deterministic confirmation ("İşlemi tamamladım.") — no
    // custom prompt guidance needed for this branch.
    return {
      status: "HANDOFF",
      handoff: communicationHandoff({
        operation: "CREATE",
        outcomeCode: "PAYMENT_REMINDER_SENT",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        candidateNames: [outcome.customerName],
        mutationPerformed: true,
      }),
    };
  },
};
