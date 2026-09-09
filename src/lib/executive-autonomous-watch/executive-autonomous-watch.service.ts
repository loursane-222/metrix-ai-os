// Executive Awareness Runtime (Grand Consolidation Stage 2, §5.3).
//
// This is the canonical background invocation of the Executive Agent: it
// runs independent of any live chat session (a scheduled GitHub Actions
// workflow, see .github/workflows/executive-watch.yml), and it is NOT a
// second brain. Its job is strictly:
//   collect evidence -> correlate/judge via the ONE Executive Agent
//   -> persist lifecycle -> deliver only if INTERVENE and eligible.
//
// Prior to Stage 2 this module computed its own CRITICAL/HIGH severity
// threshold and notified directly — that made it a competing authority.
// That judgment has been retired in favor of runAwarenessJudgment (the
// same canonical Executive Agent used in chat), leaving this module as
// plumbing only: buildExecutiveOperatingContext (Company Truth) ->
// evidenceFromAlertBundle (deterministic observation) -> Executive Agent
// judgment -> lifecycle persistence -> preference-gated delivery.
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { runAwarenessJudgment } from "@/lib/executive-agent";
import { listOrganizationIds } from "@/lib/core/organizations/organization.repository";
import { computeExecutiveSignals } from "@/lib/core/stock/stock-intelligence.service";
import { prisma } from "@/lib/core/shared/prisma";
import {
  evidenceFromAlertBundle,
  evidenceFromTaskContext,
  evidenceFromCustomerHealth,
  evidenceFromFinancialHealth,
  evidenceFromCompanyPerformanceSignal,
  evidenceFromStockSignals,
} from "./executive-autonomous-watch-evidence.service";
import { applyJudgment, resolveUnseenInsights } from "./executive-autonomous-watch-insight.repository";
import { deliverJudgment } from "./executive-autonomous-watch-delivery.service";
import type { AwarenessEvidenceEnvelope } from "./executive-autonomous-watch.types";

export type ExecutiveWatchOrganizationResult = Readonly<{
  organizationId: string;
  evidenceObserved: number;
  judgmentsMade: number;
  notificationsSent: number;
  resolvedInsights: number;
  skipped: boolean;
}>;

export type ExecutiveWatchBatchResult = Readonly<{
  processed: number;
  totalAlertsFound: number;
  totalNotificationsSent: number;
  results: readonly ExecutiveWatchOrganizationResult[];
}>;

export async function runExecutiveWatchForOrganization(
  organizationId: string,
): Promise<ExecutiveWatchOrganizationResult> {
  const operatingContext = await buildExecutiveOperatingContext({
    organizationId,
    mode: "BRIEFING",
    writePolicy: {
      syncCollectionActions: false,
      writeSignalSnapshot: false,
      writeDecisionRecords: false,
    },
  });

  const observedAt = operatingContext.generatedAt ?? new Date().toISOString();

  // Cheap deterministic observation across every currently-available Company
  // Truth surface (Grand Consolidation, final pass §2-3) — all but stock are
  // already computed as part of the single buildExecutiveOperatingContext
  // call above, so widening coverage here costs zero extra queries. Stock
  // is one bounded extra read (no per-entity loop). Every adapter produces
  // facts only; grouping/significance/disposition stays exclusively with
  // runAwarenessJudgment below.
  const stockSignals = await computeExecutiveSignals(organizationId, 90).catch(() => null);

  const evidence: AwarenessEvidenceEnvelope[] = [
    ...(operatingContext.executiveAlerts ? evidenceFromAlertBundle(operatingContext.executiveAlerts) : []),
    ...(operatingContext.taskContext ? evidenceFromTaskContext(organizationId, observedAt, operatingContext.taskContext) : []),
    ...(operatingContext.customerHealthIntelligence ? evidenceFromCustomerHealth(organizationId, operatingContext.customerHealthIntelligence) : []),
    ...(operatingContext.financialHealthIntelligence ? evidenceFromFinancialHealth(organizationId, observedAt, operatingContext.financialHealthIntelligence) : []),
    ...(operatingContext.companyPerformanceSignal ? evidenceFromCompanyPerformanceSignal(organizationId, operatingContext.companyPerformanceSignal) : []),
    ...(stockSignals ? evidenceFromStockSignals(organizationId, observedAt, stockSignals) : []),
  ];

  if (evidence.length === 0) {
    // No evidence this run means nothing currently justifies any standing
    // issue either — resolve anything still marked OPEN from a prior run.
    const resolvedInsights = await resolveUnseenInsights(organizationId, []);
    return { organizationId, evidenceObserved: 0, judgmentsMade: 0, notificationsSent: 0, resolvedInsights, skipped: false };
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });

  const judgments = await runAwarenessJudgment({
    organizationId,
    organizationName: organization?.name ?? organizationId,
    companyNarrative: operatingContext.executiveAwareness?.primaryNarrative ?? null,
    evidence,
  });

  let notificationsSent = 0;
  const seenInsightIds: string[] = [];

  for (const judgment of judgments) {
    const outcome = await applyJudgment(organizationId, judgment);
    seenInsightIds.push(outcome.insightId);

    if (outcome.shouldDeliver) {
      const delivered = await deliverJudgment(organizationId, outcome.insightId, judgment);
      if (delivered > 0) notificationsSent += 1;
    }
  }

  const resolvedInsights = await resolveUnseenInsights(organizationId, seenInsightIds);

  return {
    organizationId,
    evidenceObserved: evidence.length,
    judgmentsMade: judgments.length,
    notificationsSent,
    resolvedInsights,
    skipped: false,
  };
}

export async function runExecutiveWatch(): Promise<ExecutiveWatchBatchResult> {
  const organizationIds = await listOrganizationIds();
  const results: ExecutiveWatchOrganizationResult[] = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await runExecutiveWatchForOrganization(organizationId));
    } catch {
      results.push({
        organizationId,
        evidenceObserved: 0,
        judgmentsMade: 0,
        notificationsSent: 0,
        resolvedInsights: 0,
        skipped: true,
      });
    }
  }

  return {
    processed: results.length,
    totalAlertsFound: results.reduce((sum, r) => sum + r.evidenceObserved, 0),
    totalNotificationsSent: results.reduce((sum, r) => sum + r.notificationsSent, 0),
    results,
  };
}
