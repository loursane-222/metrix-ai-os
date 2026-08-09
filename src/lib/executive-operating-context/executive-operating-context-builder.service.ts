import { buildExecutiveBrainContext } from "@/lib/executive-brain/executive-brain-context-builder.service";
import { buildQuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import { buildPaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import { buildExpenseContextForOrganization, buildExpenseIntelligence } from "@/lib/core/expenses";
import { buildFinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import { buildExecutiveScorecard } from "@/lib/executive-scorecard";
import type { DomainEvidenceV1 } from "@/lib/domain-evidence";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { TaskContext } from "@/lib/core/tasks/task-context";
import type { QuoteStatus } from "@prisma/client";
import { listNotifications } from "@/lib/core/notifications/notification.service";

import type {
  BuildExecutiveOperatingContextInput,
  ExecutiveOperatingContext,
} from "./executive-operating-context.types";

/**
 * Legacy surface projection.
 *
 * This function no longer owns business reads, management reasoning or writes.
 * It invokes the same canonical Domain Evidence boundary as Management Picture
 * and returns only a compatibility-shaped, side-effect-free projection for
 * dashboard/briefing consumers that have not yet changed their public DTO.
 */
export async function buildExecutiveOperatingContext(
  input: BuildExecutiveOperatingContextInput,
): Promise<ExecutiveOperatingContext> {
  const canonicalContext = await buildExecutiveBrainContext({
    organizationId: input.organizationId,
    organizationMembershipRole: input.organizationMembershipRole,
    now: input.now,
  });
  const generatedAt = (input.now ?? new Date()).toISOString();
  const failedSteps = (canonicalContext.sourceReliability ?? [])
    .filter((source) => !source.connected || source.domainState === "FAILED")
    .map((source) => `domain_evidence:${source.source}`);
  const evidence = canonicalContext.domainEvidence ?? [];
  const quoteContext = projectQuoteContext(evidence);
  const paymentContext = projectPaymentContext(evidence, new Date(generatedAt));
  const collectionActionContext = projectCollectionContext(evidence, new Date(generatedAt));
  const taskContext = projectTaskContext(evidence, new Date(generatedAt));
  const unseenNotifications = input.currentUserId ? await listNotifications({ organizationId: input.organizationId, recipientUserId: input.currentUserId, unreadOnly: true }) : [];
  const quoteIntelligence = buildQuoteIntelligence(quoteContext);
  const paymentIntelligence = buildPaymentIntelligence(paymentContext);
  const expenseContext = await buildExpenseContextForOrganization(input.organizationId);
  const expenseIntelligence = buildExpenseIntelligence(expenseContext);
  const financialHealthIntelligence = buildFinancialHealthIntelligence({
    expenseContext,
    expenseIntelligence,
    paymentContext,
    paymentIntelligence,
  });
  const executiveDecisionContext = projectDecisionContext(evidence, new Date(generatedAt));
  const executiveScorecard = buildExecutiveScorecard({
    organizationId: input.organizationId,
    quoteContext,
    quoteIntelligence,
    paymentContext,
    paymentIntelligence,
    collectionActionContext,
    executiveDecisionContext,
    failedSteps,
  });

  return {
    organizationId: input.organizationId,
    mode: input.mode,
    generatedAt,
    today: generatedAt.slice(0, 10),
    memoryContext: input.preloadedMemoryContext ?? emptyMemoryContext(
      input.organizationId,
      generatedAt,
    ),
    personContext: [],
    quoteContext,
    quoteConversionContext: null,
    quoteIntelligence,
    paymentContext,
    paymentIntelligence,
    collectionActionContext,
    taskContext,
    unseenNotificationContext: {
      unreadCount: unseenNotifications.length,
      items: unseenNotifications.slice(0, 15).map((item) => ({ id: item.id, title: item.title, body: item.body, entityType: item.entityType, entityId: item.entityId, createdAt: item.createdAt.toISOString() })),
    },
    latestBriefing: null,
    executiveForecast: null,
    executiveAlerts: null,
    executiveDecisionContext,
    executiveDecisionFollowUp: null,
    executiveAccountability: null,
    executiveRhythm: null,
    executiveAwareness: null,
    executiveScorecard,
    executiveNarrative: null,
    executiveFocus: null,
    goalIntelligence: null,
    customerPortfolioIntelligence: null,
    customerHealthIntelligence: null,
    expenseContext,
    expenseIntelligence,
    financialHealthIntelligence,
    companyPerformanceSignal: null,
    executivePriority: null,
    executiveOperatingRhythm: null,
    executiveFollowUpIntelligence: null,
    recentCompletedExecutiveActions: null,
    signal: {
      dailyAnchorSnapshot: null,
      sourceSignalSnapshot: null,
      recentSnapshots: [],
      trendContext: null,
    },
    diagnostics: {
      failedSteps,
      writeActions: [],
    },
    runDeferredOperatingContextWrites: async () => undefined,
  };
}

function projectQuoteContext(evidence: readonly DomainEvidenceV1[]): QuoteContext {
  const rows = evidence
    .filter((item) => item.evidenceType === "QUOTE_RECORD")
    .map((item): Record<string, unknown> => ({
      ...projection(item),
      id: item.sourceRecordId,
    }));
  const activeStatuses: QuoteStatus[] = ["DRAFT", "SENT", "VIEWED", "NEGOTIATION"];
  const active = rows.filter((row) => activeStatuses.includes(row.status as QuoteStatus));
  const statusSummary = activeStatuses.flatMap((status) => {
    const matches = active.filter((row) => row.status === status);
    return matches.length === 0 ? [] : [{
      status,
      count: matches.length,
      total: matches.reduce((sum, row) => sum + numberValue(row.amount), 0),
    }];
  });
  const lastWon = rows.find((row) => row.status === "WON");
  return {
    openCount: active.length,
    openTotal: active.reduce((sum, row) => sum + numberValue(row.amount), 0),
    statusSummary,
    activeItems: active.slice(0, 15).map((row) => ({
      id: stringValue(row.id, "unknown"),
      customerName: stringValue(row.customerName, "Canonical customer"),
      personName: null,
      title: stringValue(row.title, "Canonical quote"),
      status: row.status as QuoteStatus,
      amount: numberValue(row.amount),
      sentAt: dateValue(row.sentAt),
      viewedAt: dateValue(row.viewedAt),
      createdAt: dateValue(row.createdAt) ?? new Date(0),
      updatedAt: dateValue(row.updatedAt) ?? new Date(0),
      events: [],
    })),
    lastWon: lastWon ? {
      customerName: stringValue(lastWon.customerName, "Canonical customer"),
      title: stringValue(lastWon.title, "Canonical quote"),
      amount: numberValue(lastWon.amount),
    } : null,
  };
}

function projectPaymentContext(
  evidence: readonly DomainEvidenceV1[],
  now: Date,
): PaymentContext {
  const rows = evidence
    .filter((item) => item.evidenceType === "PAYMENT_RECORD")
    .map((item) => projection(item));
  const receivable = rows.filter((row) =>
    ["PENDING", "PARTIAL", "OVERDUE"].includes(String(row.status))
  );
  const remaining = (row: Record<string, unknown>) =>
    Math.max(0, numberValue(row.amount) - numberValue(row.paidAmount));
  const overdue = receivable.filter((row) => row.status === "OVERDUE");
  const partial = receivable.filter((row) => row.status === "PARTIAL");
  return {
    totalReceivable: receivable.reduce((sum, row) => sum + remaining(row), 0),
    totalOverdue: overdue.reduce((sum, row) => sum + remaining(row), 0),
    overdueCount: overdue.length,
    pendingCount: receivable.filter((row) => row.status === "PENDING").length,
    partialCount: partial.length,
    overdueItems: overdue.slice(0, 10).map((row) => {
      const due = dateValue(row.dueDate) ?? new Date(0);
      return {
        title: stringValue(row.title, "Canonical payment"),
        customerName: "Canonical customer",
        amount: numberValue(row.amount),
        paidAmount: numberValue(row.paidAmount),
        dueDate: due.toISOString().slice(0, 10),
        daysPastDue: Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000)),
      };
    }),
    partialItems: partial.slice(0, 10).map((row) => ({
      title: stringValue(row.title, "Canonical payment"),
      customerName: "Canonical customer",
      amount: numberValue(row.amount),
      paidAmount: numberValue(row.paidAmount),
      dueDate: dateValue(row.dueDate)?.toISOString().slice(0, 10) ?? null,
    })),
    recentPayments: rows.filter((row) => row.status === "PAID" && dateValue(row.paidAt))
      .slice(0, 10)
      .map((row) => ({
        title: stringValue(row.title, "Canonical payment"),
        customerName: "Canonical customer",
        amount: numberValue(row.amount),
        paidAt: dateValue(row.paidAt)!.toISOString().slice(0, 10),
      })),
  };
}

function projectCollectionContext(
  evidence: readonly DomainEvidenceV1[],
  now: Date,
): CollectionActionContext {
  const rows = evidence
    .filter((item) => item.evidenceType === "COLLECTION_RECORD")
    .map((item): Record<string, unknown> => ({
      ...projection(item),
      id: item.sourceRecordId,
    }))
    .filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS");
  return {
    openCount: rows.filter((row) => row.status === "OPEN").length,
    inProgressCount: rows.filter((row) => row.status === "IN_PROGRESS").length,
    items: rows.map((row) => ({
      id: stringValue(row.id, "unknown"),
      paymentTitle: "Canonical payment",
      customerName: "Canonical customer",
      actionType: row.actionType as CollectionActionContext["items"][number]["actionType"],
      status: row.status as CollectionActionContext["items"][number]["status"],
      title: stringValue(row.title, "Canonical collection action"),
      aiReason: null,
      daysOpen: Math.max(0, Math.floor(
        (now.getTime() - (dateValue(row.createdAt) ?? now).getTime()) / 86_400_000,
      )),
      priority: numberValue(row.priority),
      events: [],
    })),
  };
}

export function projectTaskContext(evidence: readonly DomainEvidenceV1[], now: Date): TaskContext {
  const rows = evidence
    .filter((item) => item.evidenceType === "TASK_RECORD")
    .map((item): Record<string, unknown> => ({ ...projection(item), id: item.sourceRecordId }));
  const open = rows.filter((row) => row.status === "OPEN");
  const completed = rows.filter((row) => row.status === "DONE");
  const todayIso = now.toISOString().slice(0, 10);
  const overdue = open.filter((row) => {
    const due = dateValue(row.dueDate);
    return due !== null && due.toISOString().slice(0, 10) < todayIso;
  });
  const dueToday = open.filter((row) => {
    const due = dateValue(row.dueDate);
    return due !== null && due.toISOString().slice(0, 10) === todayIso;
  });
  const priorityBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const row of open) {
    const priority = row.priority as "LOW" | "MEDIUM" | "HIGH" | undefined;
    if (priority && priority in priorityBreakdown) priorityBreakdown[priority] += 1;
  }
  const assigneeCounts = new Map<string | null, number>();
  for (const row of open) {
    const assigneeUserId = typeof row.assigneeUserId === "string" ? row.assigneeUserId : null;
    assigneeCounts.set(assigneeUserId, (assigneeCounts.get(assigneeUserId) ?? 0) + 1);
  }
  return {
    openCount: open.length,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    completedCount: completed.length,
    priorityBreakdown,
    assigneeDistribution: [...assigneeCounts.entries()].map(([assigneeUserId, count]) => ({ assigneeUserId, count })),
    openItems: open.slice(0, 15).map((row) => ({
      id: stringValue(row.id, "unknown"),
      title: stringValue(row.title, "Canonical task"),
      status: "OPEN",
      priority: (row.priority as "LOW" | "MEDIUM" | "HIGH" | undefined) ?? "MEDIUM",
      dueDate: dateValue(row.dueDate)?.toISOString() ?? null,
      assigneeUserId: typeof row.assigneeUserId === "string" ? row.assigneeUserId : null,
    })),
  };
}

export function projectDecisionContext(
  evidence: readonly DomainEvidenceV1[],
  now: Date,
): ExecutiveDecisionContext {
  const decisions = evidence
    .filter((item) => item.evidenceType === "PRIOR_EXECUTIVE_DECISION")
    .map((item): Record<string, unknown> => ({
      ...projection(item),
      id: item.sourceRecordId,
    }));
  const summaries = decisions.map((row) => ({
    id: stringValue(row.id, "unknown"),
    title: stringValue(row.title, "Canonical decision"),
    rationale: stringValue(row.rationale, "Canonical decision record"),
    actionHint: nullableString(row.actionHint),
    category: nullableString(row.category),
    priority: nullableString(row.priority),
    status: row.status as ExecutiveDecisionContext["openDecisions"][number]["status"],
    followUpDueAt: nullableString(row.followUpDueAt),
    decisionDate: stringValue(row.decisionDate, now.toISOString().slice(0, 10)),
  }));
  const openDecisions = uniqueOpenDecisions(summaries.filter((row) =>
    ["PROPOSED", "COMMITTED"].includes(row.status)
  ));
  const committedDecisions = summaries.filter((row) => row.status === "COMMITTED");
  const overdueCommittedDecision = committedDecisions.find((row) =>
    row.followUpDueAt ? new Date(row.followUpDueAt) < now : false
  ) ?? null;
  const outcome = evidence.find((item) => item.evidenceType === "EXECUTIVE_OUTCOME_RECORD");
  const outcomeProjection = outcome ? projection(outcome) : null;
  const decision = outcomeProjection
    ? summaries.find((row) => row.id === outcomeProjection.decisionRecordId)
    : null;
  return {
    openDecisions,
    committedDecisions,
    overdueCommittedDecision,
    latestOutcome: outcome && outcomeProjection ? {
      id: outcome.sourceRecordId,
      decisionTitle: decision?.title ?? "Canonical decision",
      outcome: outcomeProjection.outcome as ExecutiveDecisionContext["latestOutcome"] extends infer T
        ? T extends { outcome: infer O } ? O : never
        : never,
      summary: nullableString(outcomeProjection.summary),
      occurredAt: stringValue(outcomeProjection.occurredAt, outcome.observedAt),
    } : null,
    latestExecutiveOutcome: null,
    outcomeAggregate: null,
  };
}

function uniqueOpenDecisions<T extends { title: string; category: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.category ?? ""}\u0000${row.title.trim().toLocaleLowerCase("tr-TR")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projection(item: DomainEvidenceV1): Record<string, unknown> {
  return { ...(item.projection ?? {}) };
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emptyMemoryContext(organizationId: string, generatedAt: string) {
  return {
    version: "v1" as const,
    generatedAt,
    organizationId,
    totalIncluded: 0,
    facts: [],
    processes: [],
    strategic: [],
    preferences: [],
    highlights: [],
    conflicts: [],
  };
}
