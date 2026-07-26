import type {
  ExecutiveDecisionOutcome,
  ExecutiveDecisionRecord,
} from "@prisma/client";
import type {
  ExecutiveOutcomeEvidenceReferenceV1,
  ExecutiveOutcomeStatusV1,
  ExecutiveOutcomeV1,
} from "./executive-outcome.contracts";
import { freezeExecutiveOutcomeV1 } from "./executive-outcome.validation";

export function projectExecutiveOutcomeV1(input: Readonly<{
  decisionRecord: ExecutiveDecisionRecord;
  decisionOutcome: ExecutiveDecisionOutcome | null;
  generatedAt?: string;
}>): ExecutiveOutcomeV1 {
  const { decisionRecord, decisionOutcome } = input;
  if (
    decisionOutcome
    && (
      decisionOutcome.organizationId !== decisionRecord.organizationId
      || decisionOutcome.decisionRecordId !== decisionRecord.id
    )
  ) {
    throw new TypeError("Executive outcome persistence references do not match.");
  }

  const sourceOutcome = decisionOutcome?.outcome ?? "UNAVAILABLE";
  const status = mapOutcomeStatus(decisionRecord.status, sourceOutcome);
  const evidence = buildEvidence(decisionRecord, decisionOutcome);
  const requiresReagenda =
    sourceOutcome === "FAILURE" || sourceOutcome === "ABANDONED";
  const requiresFollowUp =
    status === "PENDING" || status === "UNKNOWN" || requiresReagenda;

  return freezeExecutiveOutcomeV1({
    schemaVersion: "1.0",
    outcomeId: decisionOutcome?.id ?? `pending:${decisionRecord.id}`,
    decisionRecordId: decisionRecord.id,
    organizationId: decisionRecord.organizationId,
    conversationId:
      decisionOutcome?.conversationId ?? decisionRecord.conversationId,
    sourceMessageId:
      decisionOutcome?.sourceMessageId ?? decisionRecord.sourceMessageId,
    objective: {
      title: decisionRecord.title,
      rationale: decisionRecord.rationale || null,
      category: decisionRecord.category,
      priority: decisionRecord.priority,
    },
    status,
    sourceOutcome,
    completion: {
      decisionStatus: decisionRecord.status,
      committedAt: toIso(decisionRecord.committedAt),
      occurredAt: toIso(decisionOutcome?.occurredAt ?? null),
      closedAt: toIso(decisionRecord.closedAt),
      followUpDueAt: toIso(decisionRecord.followUpDueAt),
    },
    resultSummary: decisionOutcome?.summary ?? null,
    evidence,
    managementImpact: {
      objectiveAchieved: sourceOutcome === "SUCCESS"
        ? true
        : sourceOutcome === "FAILURE" || sourceOutcome === "ABANDONED"
          ? false
          : null,
      riskReduced: null,
      valueCreated: null,
      requiresReagenda,
      requiresFollowUp,
    },
    confidence: decisionOutcome ? "HIGH" : decisionRecord.status === "COMMITTED" ? "MEDIUM" : "LOW",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });
}

function mapOutcomeStatus(
  decisionStatus: ExecutiveDecisionRecord["status"],
  sourceOutcome: ExecutiveOutcomeV1["sourceOutcome"],
): ExecutiveOutcomeStatusV1 {
  if (sourceOutcome === "SUCCESS") return "ACHIEVED";
  if (sourceOutcome === "FAILURE") return "NOT_ACHIEVED";
  if (sourceOutcome === "ABANDONED") return "ABANDONED";
  if (decisionStatus === "COMMITTED") return "PENDING";
  return "UNKNOWN";
}

function buildEvidence(
  record: ExecutiveDecisionRecord,
  outcome: ExecutiveDecisionOutcome | null,
): ExecutiveOutcomeEvidenceReferenceV1[] {
  const references: ExecutiveOutcomeEvidenceReferenceV1[] = [
    { id: record.id, kind: "DECISION_RECORD" },
  ];
  if (outcome) references.push({ id: outcome.id, kind: "DECISION_OUTCOME" });
  const sourceMessageId = outcome?.sourceMessageId ?? record.sourceMessageId;
  if (sourceMessageId) {
    references.push({ id: sourceMessageId, kind: "USER_STATEMENT" });
  }
  return references;
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
