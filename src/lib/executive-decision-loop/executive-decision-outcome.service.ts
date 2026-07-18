import {
  closeExecutiveDecisionRecord,
  createExecutiveDecisionOutcomeIfMissing,
} from "./executive-decision-record.repository";
import { findBestOpenDecisionRecord } from "./executive-decision-record.service";
import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";
import { authorizeExecutiveDecisionRecordTransition } from "./executive-decision-transition-authorization";

import type { RegisterExecutiveDecisionOutcomeInput } from "./executive-decision-loop.types";

export async function registerExecutiveDecisionOutcome(
  input: RegisterExecutiveDecisionOutcomeInput,
): Promise<void> {
  const decision = await findBestOpenDecisionRecord(
    input.organizationId,
    input.committedTitle,
  );
  if (!decision) return;
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
  await createExecutiveDecisionOutcomeIfMissing({
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

  await closeExecutiveDecisionRecord({
    id: decision.id,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    closedAt: occurredAt,
  }, authorizeExecutiveDecisionRecordTransition({
    transition: "CLOSE",
    organizationId: input.organizationId,
    targetId: decision.id,
    fromStatus: decision.status,
    sourceService: "executive-decision-outcome.service.registerExecutiveDecisionOutcome",
  }));
}
