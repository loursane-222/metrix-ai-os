import {
  closeExecutiveDecisionRecord,
  createExecutiveDecisionOutcomeIfMissing,
} from "./executive-decision-record.repository";
import { findBestOpenDecisionRecord } from "./executive-decision-record.service";

import type { RegisterExecutiveDecisionOutcomeInput } from "./executive-decision-loop.types";

export async function registerExecutiveDecisionOutcome(
  input: RegisterExecutiveDecisionOutcomeInput,
): Promise<void> {
  const decision = await findBestOpenDecisionRecord(
    input.organizationId,
    input.committedTitle,
  );
  if (!decision) return;

  const occurredAt = new Date();
  await createExecutiveDecisionOutcomeIfMissing({
    organizationId: input.organizationId,
    decisionRecordId: decision.id,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    outcome: input.outcome,
    summary: input.summary ?? null,
    evidenceJson: input.evidenceJson ?? null,
    occurredAt,
  });

  await closeExecutiveDecisionRecord({
    id: decision.id,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    closedAt: occurredAt,
  });
}
