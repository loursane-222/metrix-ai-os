import type { CommitmentOutcome } from "@/lib/ai/executive-conversation.types";
export type { CommitmentOutcome };

export type CommitmentOutcomeSignal = {
  outcome: CommitmentOutcome;
  confidence: number;
  rawKeywords: string[];
};
