import type { AdaptationPrompt } from "@/lib/adaptation/adaptation-prompt.types";
import type {
  RecognitionOpportunity,
  RecognitionSnapshot,
} from "@/lib/recognition/recognition-snapshot.types";

export type LearningLoopResult = {
  snapshot: RecognitionSnapshot;
  opportunity: RecognitionOpportunity | null;
  prompt: AdaptationPrompt | null;
};

export type BuildLearningLoopInput = {
  organizationId: string;
};
