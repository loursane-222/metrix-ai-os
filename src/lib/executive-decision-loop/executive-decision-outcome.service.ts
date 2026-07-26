import {
  closeExecutiveDecisionRecord,
  createExecutiveDecisionOutcomeIfMissing,
} from "./executive-decision-record.repository";
import { findBestOpenDecisionRecord } from "./executive-decision-record.service";
import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";
import { authorizeExecutiveDecisionRecordTransition } from "./executive-decision-transition-authorization";

import type { RegisterExecutiveDecisionOutcomeInput } from "./executive-decision-loop.types";
import {
  projectExecutiveOutcomeV1,
  type ExecutiveOutcomeV1,
} from "@/lib/executive-outcome";

export async function registerExecutiveDecisionOutcome(
  input: RegisterExecutiveDecisionOutcomeInput,
): Promise<void> {
  await registerAndResolveExecutiveDecisionOutcome(input);
}

export async function registerAndResolveExecutiveDecisionOutcome(
  input: RegisterExecutiveDecisionOutcomeInput,
): Promise<ExecutiveOutcomeV1 | null> {
  const startedAt = performance.now();
  const decision = await findBestOpenDecisionRecord(
    input.organizationId,
    input.committedTitle,
  );
  if (!decision) return null;
  if (decision.status !== "COMMITTED") {
    throw new Error(`Decision ${decision.id} cannot be closed from ${decision.status}.`);
  }

  const authorityDecision = evaluateKnowledgeSignal({
    producer: "DECISION_OUTCOME",
    key: `decision_outcome:${decision.id}`,
    value: input.summary?.trim() || input.outcome,
    epistemicType: "DECISION",
    verified: true,
    durable: true,
    metadata: { decisionRecordId: decision.id, outcome: input.outcome },
  });
  if (authorityDecision.canonicalOwner !== "DECISION_RECORD") {
    throw new Error("Knowledge Authority rejected Decision Record ownership.");
  }

  const occurredAt = new Date();
  console.info("executive_outcome_projection_started", telemetryBase(input, {
    decisionRecordId: decision.id,
    outcomeId: null,
    sourceOutcome: input.outcome,
    status: "UNKNOWN",
    requiresFollowUp: false,
    requiresReagenda: false,
    confidence: "LOW",
    latencyMs: 0,
    fallbackReason: null,
  }));
  let persistedOutcome;
  let closedDecision;
  try {
    persistedOutcome = await createExecutiveDecisionOutcomeIfMissing({
      organizationId: input.organizationId,
      decisionRecordId: decision.id,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      outcome: input.outcome,
      summary: input.summary ?? null,
      evidenceJson: {
        ...(input.evidenceJson ?? {}),
        knowledgeAuthority: {
          epistemicType: authorityDecision.epistemicType,
          truthBoundary: authorityDecision.truthBoundary,
          canonicalOwner: authorityDecision.canonicalOwner,
          projections: authorityDecision.projections.map((projection) => ({
            target: projection.target,
            epistemicType: projection.epistemicType,
            truthBoundary: projection.truthBoundary,
            readOnly: projection.readOnly,
          })),
        },
      },
      occurredAt,
    }, authorityDecision);

    closedDecision = await closeExecutiveDecisionRecord({
      id: decision.id,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      closedAt: occurredAt,
    }, authorizeExecutiveDecisionRecordTransition({
      transition: "CLOSE",
      organizationId: input.organizationId,
      targetId: decision.id,
      fromStatus: decision.status,
      sourceService: "executive-decision-outcome.service.registerAndResolveExecutiveDecisionOutcome",
    }));
  } catch (error) {
    console.warn("executive_outcome_projection_failed", telemetryBase(input, {
      decisionRecordId: decision.id,
      outcomeId: persistedOutcome?.id ?? null,
      sourceOutcome: input.outcome,
      status: "UNKNOWN",
      requiresFollowUp: true,
      requiresReagenda: false,
      confidence: "LOW",
      latencyMs: Math.round(performance.now() - startedAt),
      fallbackReason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    }));
    throw error;
  }

  try {
    const outcome = projectExecutiveOutcomeV1({
      decisionRecord: closedDecision,
      decisionOutcome: persistedOutcome,
    });
    console.info("executive_outcome_resolved", telemetryBase(input, {
      decisionRecordId: outcome.decisionRecordId,
      outcomeId: outcome.outcomeId,
      sourceOutcome: outcome.sourceOutcome,
      status: outcome.status,
      requiresFollowUp: outcome.managementImpact.requiresFollowUp,
      requiresReagenda: outcome.managementImpact.requiresReagenda,
      confidence: outcome.confidence,
      latencyMs: Math.round(performance.now() - startedAt),
      fallbackReason: null,
    }));
    return outcome;
  } catch (error) {
    console.warn("executive_outcome_projection_failed", telemetryBase(input, {
      decisionRecordId: decision.id,
      outcomeId: persistedOutcome?.id ?? null,
      sourceOutcome: input.outcome,
      status: "UNKNOWN",
      requiresFollowUp: true,
      requiresReagenda: false,
      confidence: "LOW",
      latencyMs: Math.round(performance.now() - startedAt),
      fallbackReason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    }));
    return null;
  }
}

function telemetryBase(
  input: RegisterExecutiveDecisionOutcomeInput,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    requestId: input.requestId ?? null,
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    ...fields,
  };
}
