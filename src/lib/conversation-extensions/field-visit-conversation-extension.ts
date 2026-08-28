import { fetchFieldVisitWeeklySummary, submitFieldVisitReport } from "@/lib/field-visits/field-visits-client";
import type { ConversationExtension } from "./conversation-extension-contract";
import { teamHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant keyword pre-gate — mirrors orchestration-conversation-
// extension.ts's ACTION_VERB_STEM precedent: cheap regex check before
// spending an LLM call on messages that plainly aren't a field visit report.
const FIELD_VISIT_TRIGGER = /(toplant[ıi]|ziyaret|g[oö]r[uü]şt[uü]m|u[ğg]rad[ıi]m|ma[ğg]azas[ıi]na gittim|m[uü]şteriye gittim)/iu;

// Checked BEFORE FIELD_VISIT_TRIGGER — "bu hafta ziyaret ettiklerimi
// özetle" contains "ziyaret" too, and must be read as a summary query, not
// a new visit report.
const WEEKLY_SUMMARY_TRIGGER = /(haftal[ıi]k\s+(özet|rapor)|bu\s+hafta(?:ki)?\s+(?:ziyaret|özet|rapor)|saha\s+raporu)/iu;
const COLLEAGUE_REFERENCE_PATTERN = /^(.+?)(?:'|’)?(?:n[ıi]n|nin|nun|n[uü]n|in|[ıi]n|un|[uü]n)\s+(?:bu\s+)?hafta(?:ki)?\s+(?:özeti|raporu|ziyaretleri)/iu;
// Turkish consonant softening turns "ekip" into "ekib-" before a suffix
// (ekibin, ekibi) — matching the stem "ekib" alongside "ekip" catches both.
const TEAM_REFERENCE_PATTERN = /ekib|ekip|tak[ıi]m/iu;

// Each returned line independently feeds one ConversationExtensionHandoff
// candidateName slot, capped at 120 chars by SAFE_CANDIDATE_NAME
// (conversation-extension-handoff.ts) — kept compact and split across two
// entries rather than one long sentence so that cap is never at risk.
function summaryLines(
  summary: { weekStart: string; weekEnd: string; visitCount: number; distinctCustomerCount: number; linkedOrderCount: number; linkedPaymentCount: number; linkedPaymentTotal: number },
  companyGoalStatus: { monthlyTarget: number; monthToDateRevenue: number; goalAchievementRate: number } | null,
): string[] {
  const base = `${summary.weekStart} - ${summary.weekEnd}, ${summary.visitCount} ziyaret, ${summary.distinctCustomerCount} müşteri, ${summary.linkedOrderCount} sipariş`;
  const visitLine = summary.linkedPaymentCount > 0
    ? `${base}, ${summary.linkedPaymentCount} tahsilat, ${Math.round(summary.linkedPaymentTotal).toLocaleString("tr-TR")} TL`
    : base;
  if (!companyGoalStatus) return [visitLine];

  const rate = Math.round(companyGoalStatus.goalAchievementRate * 100);
  const goalLine = `Şirket hedefi ${Math.round(companyGoalStatus.monthlyTarget).toLocaleString("tr-TR")} TL, gerçekleşen ${Math.round(companyGoalStatus.monthToDateRevenue).toLocaleString("tr-TR")} TL, oran yüzde ${rate}`;
  return [visitLine, goalLine];
}

async function handleWeeklySummaryQuery(text: string) {
  const colleagueMatch = text.match(COLLEAGUE_REFERENCE_PATTERN);
  const targetReference = colleagueMatch ? colleagueMatch[1]!.trim() : (TEAM_REFERENCE_PATTERN.test(text) ? "ekip" : null);

  const result = await fetchFieldVisitWeeklySummary(targetReference);
  if (!result.ok) {
    return { status: "HANDOFF" as const, handoff: teamHandoff({ operation: "QUERY", outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_FAILED", resultStatus: "FAILED", failureCode: "FIELD_VISIT_WEEKLY_SUMMARY_REQUEST_FAILED" }) };
  }

  const lookup = result.data.lookup;
  if (lookup.status === "DENIED") {
    return { status: "HANDOFF" as const, handoff: teamHandoff({ operation: "QUERY", outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_DENIED", resultStatus: "FAILED", failureCode: "FIELD_VISIT_WEEKLY_SUMMARY_ACCESS_DENIED" }) };
  }
  if (lookup.status === "NOT_FOUND") {
    return { status: "HANDOFF" as const, handoff: teamHandoff({ operation: "QUERY", outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_REP_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
  }
  if (lookup.status === "AMBIGUOUS") {
    return { status: "HANDOFF" as const, handoff: teamHandoff({ operation: "QUERY", outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: lookup.options }) };
  }

  return {
    status: "HANDOFF" as const,
    handoff: teamHandoff({
      operation: "QUERY",
      outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_FOUND",
      resultStatus: "OBSERVED",
      entityResolution: "RESOLVED",
      candidateNames: summaryLines(lookup.summary, lookup.companyGoalStatus),
    }),
  };
}

export const fieldVisitConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `field-visit:${window.location.pathname}`;
  },

  async execute(utterance) {
    const text = utterance.trim();

    if (WEEKLY_SUMMARY_TRIGGER.test(text)) return handleWeeklySummaryQuery(text);

    if (!FIELD_VISIT_TRIGGER.test(text)) return { status: "NOT_HANDLED", handoff: null };

    const result = await submitFieldVisitReport(text);
    if (!result.ok) {
      return {
        status: "HANDOFF",
        handoff: teamHandoff({ operation: "CREATE", outcomeCode: "FIELD_VISIT_REPORT_FAILED", resultStatus: "FAILED", failureCode: "FIELD_VISIT_REPORT_REQUEST_FAILED" }),
      };
    }

    const report = result.data.report;
    // The keyword gate is loose on purpose (a real free-form sentence, not
    // a fixed command) — if the parser genuinely couldn't extract a visit
    // out of it, this probably wasn't a report at all (e.g. a question
    // that happens to contain "ziyaret"). Let it fall through rather than
    // claiming a turn we can't back with real extracted data.
    if (report.status === "PARSE_FAILED") return { status: "NOT_HANDLED", handoff: null };

    return {
      status: "HANDOFF",
      handoff: teamHandoff({
        operation: "CREATE",
        outcomeCode: "FIELD_VISIT_LOGGED",
        resultStatus: "EXECUTED",
        entityResolution: report.customerResolved ? "RESOLVED" : "NOT_FOUND",
        mutationPerformed: true,
        candidateNames: [report.customerNameRaw],
      }),
    };
  },
};
