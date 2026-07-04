import {
  findLatestExecutiveDecisionOutcome,
  listExecutiveDecisionContextRecords,
} from "./executive-decision-record.repository";
import { buildExecutiveDecisionOutcomeAggregate } from "./executive-decision-outcome-aggregate.service";

import type {
  BuildExecutiveDecisionContextInput,
  ExecutiveDecisionContext,
  ExecutiveDecisionRecordSummary,
} from "./executive-decision-loop.types";

const MAX_OPEN_DECISIONS = 2;

export async function buildExecutiveDecisionContext(
  input: BuildExecutiveDecisionContextInput,
): Promise<ExecutiveDecisionContext> {
  const now = input.now ?? new Date();
  const [records, latestOutcome, outcomeAggregate] = await Promise.all([
    listExecutiveDecisionContextRecords(input.organizationId),
    findLatestExecutiveDecisionOutcome(input.organizationId),
    buildExecutiveDecisionOutcomeAggregate(input.organizationId, now),
  ]);

  const overdueCommittedDecision =
    records
      .filter((record) => {
        return (
          record.status === "COMMITTED" &&
          record.followUpDueAt !== null &&
          record.followUpDueAt.getTime() <= now.getTime()
        );
      })
      .sort(compareDecisionRecords)[0] ?? null;

  const committedDecisions = records
    .filter((record) => record.status === "COMMITTED")
    .sort(compareDecisionRecords)
    .map(toSummary);

  const openDecisions = records
    .filter((record) => record.status === "PROPOSED")
    .sort(compareDecisionRecords)
    .slice(0, MAX_OPEN_DECISIONS)
    .map(toSummary);

  return {
    openDecisions,
    committedDecisions,
    overdueCommittedDecision: overdueCommittedDecision
      ? toSummary(overdueCommittedDecision)
      : null,
    latestOutcome: latestOutcome
      ? {
          id: latestOutcome.id,
          decisionTitle: latestOutcome.decisionRecord.title,
          outcome: latestOutcome.outcome,
          summary: latestOutcome.summary,
          occurredAt: latestOutcome.occurredAt.toISOString(),
        }
      : null,
    outcomeAggregate,
  };
}

function compareDecisionRecords(
  left: {
    priority: string | null;
    followUpDueAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
  },
  right: {
    priority: string | null;
    followUpDueAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
  },
): number {
  return (
    priorityRank(right.priority) - priorityRank(left.priority) ||
    nullableTime(left.followUpDueAt) - nullableTime(right.followUpDueAt) ||
    right.updatedAt.getTime() - left.updatedAt.getTime() ||
    right.createdAt.getTime() - left.createdAt.getTime()
  );
}

function toSummary(record: {
  id: string;
  title: string;
  rationale: string;
  actionHint: string | null;
  category: string | null;
  priority: string | null;
  status: ExecutiveDecisionRecordSummary["status"];
  followUpDueAt: Date | null;
  decisionDate: string;
}): ExecutiveDecisionRecordSummary {
  return {
    id: record.id,
    title: record.title,
    rationale: record.rationale,
    actionHint: record.actionHint,
    category: record.category,
    priority: record.priority,
    status: record.status,
    followUpDueAt: record.followUpDueAt?.toISOString() ?? null,
    decisionDate: record.decisionDate,
  };
}

function priorityRank(priority: string | null): number {
  if (priority === "CRITICAL") return 4;
  if (priority === "HIGH") return 3;
  if (priority === "MEDIUM" || priority === "WATCH") return 2;
  if (priority === "LOW") return 1;
  return 0;
}

function nullableTime(value: Date | null): number {
  return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
