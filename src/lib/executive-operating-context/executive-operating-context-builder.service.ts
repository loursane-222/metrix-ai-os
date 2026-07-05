import { prisma } from "@/lib/core/shared/prisma";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import { buildQuoteContextForOrganization } from "@/lib/core/quotes/quote-context-builder";
import { buildQuoteConversionContextForOrganization } from "@/lib/core/quotes/quote-conversion-context-builder";
import { buildQuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import { buildPaymentContextForOrganization } from "@/lib/core/payments/payment-context-builder";
import { buildPaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import { syncAiCollectionActions } from "@/lib/core/collection-actions/collection-action-sync.service";
import { buildCollectionActionContextForOrganization } from "@/lib/core/collection-actions/collection-action-context-builder";
import { getLatestDailyBriefingForOrganization } from "@/lib/daily-briefing/daily-briefing-storage.service";
import { buildExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting-engine.service";
import { buildExecutiveAlerts } from "@/lib/executive-alerts/executive-alert-engine.service";
import { buildExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm-engine.service";
import {
  getIstanbulDateString,
  maybeWriteSignalSnapshot,
} from "@/lib/signal-persistence/executive-signal-snapshot.service";
import {
  findDailyAnchorForDate,
  findRecentSnapshots,
} from "@/lib/signal-persistence/executive-signal-snapshot.repository";
import { buildSignalTrendContext } from "@/lib/signal-persistence/signal-trend-context-builder.service";
import {
  buildExecutiveDecisionContext,
  ensureExecutiveDecisionRecords,
} from "@/lib/executive-decision-loop";
import { buildExecutiveDecisionFollowUp } from "@/lib/executive-decision-follow-up";
import { buildExecutiveAccountability } from "@/lib/executive-accountability";
import { buildExecutiveAwareness } from "@/lib/executive-awareness";
import { buildExecutiveScorecard } from "@/lib/executive-scorecard";
import { buildExecutiveNarrative } from "@/lib/executive-narrative";
import { buildExecutiveFocus } from "@/lib/executive-focus";
import { buildExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import { buildCustomerPortfolioIntelligence } from "@/lib/customer-portfolio-intelligence";
import { buildCustomerHealthIntelligence } from "@/lib/customer-health-intelligence";
import { buildExpenseContextForOrganization, buildExpenseIntelligence } from "@/lib/core/expenses";
import { buildFinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import { buildCompanyPerformanceSignal } from "@/lib/company-performance-signal";
import { buildExecutivePrioritizationResult } from "@/lib/executive-prioritization";
import { syncPriorityMovesToActions } from "@/lib/core/executive-actions/executive-priority-action-bridge.service";
import {
  listOpenExecutiveActions,
  listRecentCompletedExecutiveActions,
} from "@/lib/core/executive-actions/executive-action-engine.service";
import { buildExecutiveOperatingRhythm } from "@/lib/executive-operating-rhythm";
import { buildExecutiveFollowUpIntelligence } from "@/lib/executive-follow-up-intelligence";

import type {
  BuildExecutiveOperatingContextInput,
  ExecutiveOperatingContext,
  ExecutiveOperatingContextDiagnostics,
  ExecutiveOperatingContextWritePolicy,
} from "./executive-operating-context.types";

const MAX_PERSON_CONTEXT = 20;
const TREND_LOOKBACK_DAYS = 7;

const DEFAULT_WRITE_POLICY: ExecutiveOperatingContextWritePolicy = {
  syncCollectionActions: false,
  writeSignalSnapshot: false,
  writeDecisionRecords: false,
  syncPriorityActions: false,
};

export async function buildExecutiveOperatingContext(
  input: BuildExecutiveOperatingContextInput,
): Promise<ExecutiveOperatingContext> {
  const diagnostics: ExecutiveOperatingContextDiagnostics = {
    failedSteps: [],
    writeActions: [],
  };
  const writePolicy = { ...DEFAULT_WRITE_POLICY, ...input.writePolicy };
  const strictSteps = new Set(input.strictSteps ?? []);
  const today = getIstanbulDateString();
  const trendCutoffDate = getIstanbulDateString(-(TREND_LOOKBACK_DAYS - 1));
  const sevenDaysAgo = new Date((input.now ?? new Date()).getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    memoryContext,
    personContext,
    quoteContext,
    paymentContext,
    quoteConversionContext,
    latestBriefing,
    todayAnchorSnapshot,
    recentSignalSnapshots,
    openExecutiveActions,
    recentCompletedExecutiveActions,
  ] = await Promise.all([
    runStep("memoryContext", diagnostics, strictSteps, () =>
      buildMemoryContextForOrganization({ organizationId: input.organizationId }),
    ),
    runStep("personContext", diagnostics, strictSteps, () =>
      prisma.person.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { updatedAt: "desc" },
        take: MAX_PERSON_CONTEXT,
        select: { type: true, fullName: true, title: true, notes: true },
      }),
    ),
    runStep("quoteContext", diagnostics, strictSteps, () =>
      buildQuoteContextForOrganization(input.organizationId),
    ),
    runStep("paymentContext", diagnostics, strictSteps, () =>
      buildPaymentContextForOrganization(input.organizationId),
    ),
    runStep("quoteConversionContext", diagnostics, strictSteps, () =>
      buildQuoteConversionContextForOrganization(input.organizationId),
    ),
    runStep("latestBriefing", diagnostics, strictSteps, () =>
      getLatestDailyBriefingForOrganization(input.organizationId),
    ),
    runStep("todayAnchorSnapshot", diagnostics, strictSteps, () =>
      findDailyAnchorForDate(input.organizationId, today),
    ),
    runStep("recentSignalSnapshots", diagnostics, strictSteps, () =>
      findRecentSnapshots(input.organizationId, trendCutoffDate),
    ),
    runStep("openExecutiveActions", diagnostics, strictSteps, () =>
      listOpenExecutiveActions(input.organizationId),
    ),
    runStep("recentCompletedExecutiveActions", diagnostics, strictSteps, () =>
      listRecentCompletedExecutiveActions(input.organizationId, sevenDaysAgo),
    ),
  ]);

  const signalTrendContext =
    recentSignalSnapshots !== null
      ? buildSignalTrendContext(recentSignalSnapshots, TREND_LOOKBACK_DAYS)
      : null;

  const quoteIntelligence = quoteContext
    ? buildQuoteIntelligence(quoteContext, quoteConversionContext)
    : null;
  const paymentIntelligence = paymentContext
    ? buildPaymentIntelligence(paymentContext)
    : null;

  if (writePolicy.syncCollectionActions) {
    await runWriteStep("syncCollectionActions", diagnostics, strictSteps, async () => {
      await syncAiCollectionActions(input.organizationId);
    });
  }

  const collectionActionContext = await runStep(
    "collectionActionContext",
    diagnostics,
    strictSteps,
    () => buildCollectionActionContextForOrganization(input.organizationId),
  );

  const activeSalesGoals = await runStep(
    "activeSalesGoals",
    diagnostics,
    strictSteps,
    () =>
      prisma.salesGoal.findMany({
        where: { organizationId: input.organizationId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      }),
  );

  const goalIntelligence = buildExecutiveGoalIntelligence(memoryContext, activeSalesGoals);

  const executiveForecast = await runStep("executiveForecast", diagnostics, strictSteps, () =>
    buildExecutiveForecast({
      organizationId: input.organizationId,
      paymentContext,
      paymentIntelligence,
      quoteContext,
      conversionIntelligence: quoteIntelligence?.conversionIntelligence ?? null,
      collectionActionContext,
      latestBriefing: latestBriefing?.briefingPackage ?? null,
      goalIntelligence,
    }),
  );

  let sourceSignalSnapshot = todayAnchorSnapshot;
  if (executiveForecast && writePolicy.writeSignalSnapshot) {
    await runWriteStep("writeSignalSnapshot", diagnostics, strictSteps, async () => {
      await maybeWriteSignalSnapshot(
        input.organizationId,
        today,
        executiveForecast,
        todayAnchorSnapshot,
      );
      sourceSignalSnapshot =
        todayAnchorSnapshot ??
        (await findDailyAnchorForDate(input.organizationId, today));
    });
  }

  const executiveAlerts = await runStep("executiveAlerts", diagnostics, strictSteps, async () =>
    buildExecutiveAlerts({
      organizationId: input.organizationId,
      executiveForecast,
      latestBriefing: latestBriefing?.briefingPackage ?? null,
      quoteIntelligence,
      paymentIntelligence,
      collectionActionContext,
    }),
  );

  const runtimeAugmentation = input.resolveRuntimeAugmentation?.({
    quoteIntelligence,
    quoteConversionContext,
  });
  const recommendationPackage =
    input.recommendationPackage ??
    runtimeAugmentation?.recommendationPackage ??
    null;
  const conversationState =
    input.conversationState ??
    runtimeAugmentation?.conversationState ??
    null;

  if (writePolicy.writeDecisionRecords && input.conversationId) {
    await runWriteStep("writeDecisionRecords", diagnostics, strictSteps, async () => {
      await ensureExecutiveDecisionRecords({
        organizationId: input.organizationId,
        conversationId: input.conversationId!,
        decisionDate: today,
        sourceSnapshotId: sourceSignalSnapshot?.id ?? null,
        recommendationPackage,
        executiveBrainContext: input.executiveBrainContext ?? null,
        executiveAlerts,
        executiveForecast,
      });
    });
  }

  const executiveDecisionContext = await runStep(
    "executiveDecisionContext",
    diagnostics,
    strictSteps,
    () =>
      buildExecutiveDecisionContext({
        organizationId: input.organizationId,
        now: input.now,
      }),
  );

  const executiveDecisionFollowUp = await runStep(
    "executiveDecisionFollowUp",
    diagnostics,
    strictSteps,
    () =>
      Promise.resolve(
        buildExecutiveDecisionFollowUp({
          organizationId: input.organizationId,
          now: input.now,
          executiveDecisionContext,
        }),
      ),
  );

  const executiveAccountability = await runStep(
    "executiveAccountability",
    diagnostics,
    strictSteps,
    () =>
      Promise.resolve(
        buildExecutiveAccountability({
          organizationId: input.organizationId,
          now: input.now,
          executiveDecisionContext,
          executiveDecisionFollowUp,
          conversationState,
          personContext: personContext ?? [],
          memoryContext,
          paymentContext,
          paymentIntelligence,
          collectionActionContext,
          currentUserId: input.currentUserId,
          currentUserName: input.currentUserName,
          organizationMembershipRole: input.organizationMembershipRole,
          executiveActions: (openExecutiveActions ?? []).map((a) => ({
            id: a.id,
            title: a.title,
            sourceType: a.sourceType as "EXECUTIVE_PRIORITY" | "DAILY_BRIEFING" | "MANAGEMENT_REVIEW" | "PERFORMANCE_SIGNAL" | "CUSTOMER_SIGNAL" | "DECISION" | "MANUAL",
            ownerType: (a.ownerType === "USER" || a.ownerType === "PERSON") ? a.ownerType : "UNASSIGNED" as const,
            ownerId: a.ownerId,
            status: a.status as "OPEN" | "IN_PROGRESS" | "WAITING",
            priority: a.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            dueDate: a.dueDate,
            createdAt: a.createdAt,
          })),
        }),
      ),
  );

  const executiveRhythm = await runStep("executiveRhythm", diagnostics, strictSteps, async () =>
    buildExecutiveRhythm({
      organizationId: input.organizationId,
      executiveAlerts,
      executiveForecast,
      latestBriefing: latestBriefing?.briefingPackage ?? null,
      conversationState,
      decisionContext: executiveDecisionContext,
      quoteIntelligence,
      paymentIntelligence,
    }),
  );

  const executiveAwareness = await runStep("executiveAwareness", diagnostics, strictSteps, async () =>
    buildExecutiveAwareness({
      organizationId: input.organizationId,
      executiveForecast,
      executiveAlerts,
      signalTrendContext,
      executiveDecisionContext,
      executiveRhythm,
      paymentIntelligence,
      quoteIntelligence,
      collectionActionContext,
      failedSteps: diagnostics.failedSteps,
    }),
  );

  const executiveScorecard = await runStep("executiveScorecard", diagnostics, strictSteps, async () =>
    buildExecutiveScorecard({
      organizationId: input.organizationId,
      executiveForecast,
      executiveAlerts,
      signalTrendContext,
      executiveDecisionContext,
      executiveRhythm,
      paymentContext,
      paymentIntelligence,
      quoteContext,
      quoteIntelligence,
      collectionActionContext,
      latestBriefing: latestBriefing?.briefingPackage ?? null,
      failedSteps: diagnostics.failedSteps,
    }),
  );

  const executiveNarrative = await runStep("executiveNarrative", diagnostics, strictSteps, async () =>
    buildExecutiveNarrative({
      organizationId: input.organizationId,
      executiveAwareness,
      executiveScorecard,
      executiveRhythm,
      executiveDecisionContext,
      executiveAlerts,
      executiveForecast,
      signalTrendContext,
      latestBriefing: latestBriefing?.briefingPackage ?? null,
      failedSteps: diagnostics.failedSteps,
    }),
  );

  const executiveFocus = await runStep("executiveFocus", diagnostics, strictSteps, async () =>
    buildExecutiveFocus({
      organizationId: input.organizationId,
      executiveAwareness,
      executiveScorecard,
      executiveNarrative,
      executiveRhythm,
      executiveDecisionContext,
      executiveAlerts,
      executiveForecast,
      signalTrendContext,
      failedSteps: diagnostics.failedSteps,
    }),
  );

  const customerPortfolioIntelligence = await runStep(
    "customerPortfolioIntelligence",
    diagnostics,
    strictSteps,
    () => buildCustomerPortfolioIntelligence(input.organizationId),
  );

  const customerHealthIntelligence = await runStep(
    "customerHealthIntelligence",
    diagnostics,
    strictSteps,
    () => buildCustomerHealthIntelligence(input.organizationId, customerPortfolioIntelligence),
  );

  const expenseContext = await runStep(
    "expenseContext",
    diagnostics,
    strictSteps,
    () => buildExpenseContextForOrganization(input.organizationId),
  );

  const expenseIntelligence = expenseContext
    ? buildExpenseIntelligence(expenseContext)
    : null;

  const financialHealthIntelligence = await runStep(
    "financialHealthIntelligence",
    diagnostics,
    strictSteps,
    () =>
      Promise.resolve(
        buildFinancialHealthIntelligence({
          paymentIntelligence,
          paymentContext,
          expenseIntelligence,
          expenseContext,
          goalIntelligence,
          forecast: executiveForecast,
        }),
      ),
  );

  const companyPerformanceSignal = buildCompanyPerformanceSignal({
    executiveScorecard,
    financialHealthIntelligence,
    executiveForecast,
    executiveAwareness,
    customerHealthIntelligence,
    goalIntelligence,
  });

  const executivePriority = buildExecutivePrioritizationResult({
    organizationId:               input.organizationId,
    executiveForecast,
    executiveScorecard,
    outcomeAggregate:             executiveDecisionContext?.outcomeAggregate ?? null,
    companyPerformanceSignal,
    customerPortfolioIntelligence,
    latestBriefing:               latestBriefing?.briefingPackage ?? null,
  });

  if (writePolicy.syncPriorityActions && executivePriority) {
    await runWriteStep("syncPriorityActions", diagnostics, strictSteps, async () => {
      const orgOwnerUserId = await fetchOrgOwnerUserId(input.organizationId);
      await syncPriorityMovesToActions(executivePriority, input.organizationId, {
        orgOwnerUserId,
        currentUserId: input.currentUserId ?? null,
      });
    });
  }

  const executiveOperatingRhythm = buildExecutiveOperatingRhythm({
    organizationId:                input.organizationId,
    executivePriority,
    executiveForecast,
    executiveAlerts,
    executiveDecisionContext,
    executiveScorecard,
    customerPortfolioIntelligence,
    goalIntelligence,
    companyPerformanceSignal,
    latestBriefing:                latestBriefing?.briefingPackage ?? null,
    quoteIntelligence,
  });

  const executiveFollowUpIntelligence = buildExecutiveFollowUpIntelligence({
    organizationId: input.organizationId,
    now: input.now,
    executiveDecisionFollowUp,
    executiveAccountability,
    recentCompletedActions: recentCompletedExecutiveActions?.map((a) => ({
      id: a.id,
      title: a.title,
      outcomeStatus: a.outcomeStatus as ("SUCCESS" | "PARTIAL" | "FAILED" | "UNKNOWN") | null,
      resultSummary: a.resultSummary,
      completedAt: a.completedAt,
    })) ?? null,
  });

  return {
    organizationId: input.organizationId,
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    today,
    memoryContext,
    personContext: personContext ?? [],
    quoteContext,
    quoteConversionContext,
    quoteIntelligence,
    paymentContext,
    paymentIntelligence,
    collectionActionContext,
    latestBriefing,
    executiveForecast,
    executiveAlerts,
    executiveDecisionContext,
    executiveDecisionFollowUp,
    executiveAccountability,
    executiveRhythm,
    executiveAwareness,
    executiveScorecard,
    executiveNarrative,
    executiveFocus,
    goalIntelligence,
    customerPortfolioIntelligence,
    customerHealthIntelligence,
    expenseContext,
    expenseIntelligence,
    financialHealthIntelligence,
    companyPerformanceSignal,
    executivePriority,
    executiveOperatingRhythm,
    executiveFollowUpIntelligence,
    recentCompletedExecutiveActions: recentCompletedExecutiveActions ?? null,
    signal: {
      dailyAnchorSnapshot: todayAnchorSnapshot,
      sourceSignalSnapshot,
      recentSnapshots: recentSignalSnapshots ?? [],
      trendContext: signalTrendContext,
    },
    diagnostics,
  };
}

async function runStep<T>(
  name: string,
  diagnostics: ExecutiveOperatingContextDiagnostics,
  strictSteps: Set<string>,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("[executive-operating-context][diag] step_failed", {
      stepName: name,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      stackFirstLine: error instanceof Error ? error.stack?.split("\n")[0] : undefined,
    });
    diagnostics.failedSteps.push(name);
    if (strictSteps.has(name)) {
      throw new Error(`Executive operating context step failed: ${name}`);
    }
    return null;
  }
}

async function runWriteStep(
  name: string,
  diagnostics: ExecutiveOperatingContextDiagnostics,
  strictSteps: Set<string>,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    diagnostics.writeActions.push(name);
  } catch {
    diagnostics.failedSteps.push(name);
    if (strictSteps.has(name)) {
      throw new Error(`Executive operating context write step failed: ${name}`);
    }
  }
}

async function fetchOrgOwnerUserId(organizationId: string): Promise<string | null> {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, role: "OWNER", status: "ACTIVE" },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  return member?.userId ?? null;
}
