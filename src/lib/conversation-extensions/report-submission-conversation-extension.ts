import { submitReportAnswerMessage } from "@/lib/reports/reports-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant keyword pre-gate, mirrors field-visit-conversation-
// extension.ts's precedent — cheap regex check before spending an LLM call.
// Two independent checks rather than one contiguous phrase, matching
// report-review-conversation-extension.ts's fix: a real message like
// "raporu bu hafta dolduracağım, önemli gelişme şu..." has other words
// between "rapor" and the fill-in verb.
const REPORT_MENTION = /rapor/iu;
const FILL_IN_VERB = /(doldur|g[oö]nder|tamamla|yaz)/iu;

export const reportSubmissionConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `report-submission:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();
    if (!REPORT_MENTION.test(text) || !FILL_IN_VERB.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await submitReportAnswerMessage(text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "REPORT_SUBMISSION_REQUEST_FAILED", resultStatus: "FAILED", failureCode: "REPORT_SUBMISSION_REQUEST_FAILED" }),
      };
    }

    const report = result.data.report;
    // Loose keyword gate — if the parser found no open submission or
    // couldn't extract any real answer, this probably wasn't a genuine
    // report-filling message; fall through rather than claiming a turn we
    // can't back with real data.
    if (report.status === "NO_OPEN_SUBMISSION" || report.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    if (report.status === "PARTIAL") {
      return {
        status: "HANDOFF",
        handoff: companyHandoff({
          operation: "UPDATE",
          outcomeCode: "REPORT_SUBMISSION_PARTIAL",
          resultStatus: "EXECUTED",
          entityResolution: "RESOLVED",
          mutationPerformed: true,
          candidateNames: [`${report.templateName}, kalan sorular ${report.remainingQuestions.length}`],
        }),
      };
    }

    return {
      status: "HANDOFF",
      handoff: companyHandoff({
        operation: "UPDATE",
        outcomeCode: "REPORT_SUBMISSION_SUBMITTED",
        resultStatus: "EXECUTED",
        entityResolution: "RESOLVED",
        mutationPerformed: true,
        candidateNames: [`${report.templateName} gönderildi`],
      }),
    };
  },
};
