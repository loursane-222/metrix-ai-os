import {
  findRecentOpenExecutiveDecisionRecords,
  markExecutiveDecisionRecordCommitted,
  upsertExecutiveDecisionRecord,
} from "./executive-decision-record.repository";
import { buildExecutiveDecisionRecordCandidates } from "./executive-decision-record-builder.service";

import type {
  EnsureExecutiveDecisionRecordsInput,
  RegisterExecutiveDecisionCommitmentInput,
} from "./executive-decision-loop.types";

export async function ensureExecutiveDecisionRecords(
  input: EnsureExecutiveDecisionRecordsInput,
): Promise<void> {
  const candidates = buildExecutiveDecisionRecordCandidates(input);

  for (const candidate of candidates) {
    await upsertExecutiveDecisionRecord(candidate);
  }
}

export async function registerExecutiveDecisionCommitment(
  input: RegisterExecutiveDecisionCommitmentInput,
): Promise<void> {
  const decision = await findBestOpenDecisionRecord(
    input.organizationId,
    input.committedTitle,
  );
  if (!decision) return;

  await markExecutiveDecisionRecordCommitted({
    id: decision.id,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    committedAt: parseDateOrNow(input.committedAt),
    followUpDueAt: parseDateOrNull(input.followUpDueAt),
  });
}

export async function findBestOpenDecisionRecord(
  organizationId: string,
  titleHint: string,
) {
  const openDecisions = await findRecentOpenExecutiveDecisionRecords(organizationId);
  if (openDecisions.length === 0) return null;

  const normalizedHint = normalizeTitle(titleHint);
  const exact = openDecisions.find((decision) => {
    const normalizedTitle = normalizeTitle(decision.title);
    return normalizedTitle === normalizedHint;
  });
  if (exact) return exact;

  const contained = openDecisions.find((decision) => {
    const normalizedTitle = normalizeTitle(decision.title);
    return (
      normalizedTitle.includes(normalizedHint) ||
      normalizedHint.includes(normalizedTitle)
    );
  });
  if (contained) return contained;

  return null;
}

function parseDateOrNow(value: string | null | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}
