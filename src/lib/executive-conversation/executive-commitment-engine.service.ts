import type { CommitmentOutcome, CommitmentOutcomeSignal } from "./executive-commitment.types";
import type { ConversationSignalType, ExecutiveConversationState } from "./executive-conversation.types";

const FOLLOW_UP_DAYS = 3;

export type CommitmentTrackingFields = {
  committedTitle: string | null;
  committedAt: string | null;
  followUpDueAt: string | null;
  commitmentOutcome: CommitmentOutcome | null;
};

export type BuildCommitmentTrackingInput = {
  previousState: ExecutiveConversationState | null;
  conversationSignal: { type: ConversationSignalType; confidence: number } | null;
  outcomeSignal: CommitmentOutcomeSignal | null;
  resolvedCommittedTitle: string | null;
};

export function buildCommitmentTracking(
  input: BuildCommitmentTrackingInput,
): CommitmentTrackingFields {
  const { previousState, conversationSignal, outcomeSignal, resolvedCommittedTitle } = input;
  const now = new Date();

  // Outcome bildirimi: taahhüt sonuçlandı
  if (outcomeSignal) {
    return {
      committedTitle: previousState?.committedTitle ?? resolvedCommittedTitle,
      committedAt: previousState?.committedAt ?? null,
      followUpDueAt: null,
      commitmentOutcome: outcomeSignal.outcome,
    };
  }

  // Yeni güçlü taahhüt
  if (conversationSignal?.type === "COMMITMENT") {
    const followUpDue = new Date(now);
    followUpDue.setDate(followUpDue.getDate() + FOLLOW_UP_DAYS);
    return {
      committedTitle: resolvedCommittedTitle,
      committedAt: now.toISOString(),
      followUpDueAt: followUpDue.toISOString(),
      commitmentOutcome: null,
    };
  }

  // Önceki taahhüdü koru
  return {
    committedTitle: previousState?.committedTitle ?? null,
    committedAt: previousState?.committedAt ?? null,
    followUpDueAt: previousState?.followUpDueAt ?? null,
    commitmentOutcome: previousState?.commitmentOutcome ?? null,
  };
}

export function isNewCommitment(
  previousState: ExecutiveConversationState | null,
  newState: ExecutiveConversationState,
): boolean {
  return (
    previousState?.phase !== "COMMITTED" &&
    newState.phase === "COMMITTED" &&
    newState.committedTitle !== null
  );
}

export function isNewOutcome(
  previousState: ExecutiveConversationState | null,
  newState: ExecutiveConversationState,
): boolean {
  return (
    previousState?.commitmentOutcome == null &&
    newState.commitmentOutcome !== null
  );
}
