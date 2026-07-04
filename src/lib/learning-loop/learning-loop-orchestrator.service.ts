import { buildAdaptationPrompt } from "@/lib/adaptation/adaptation-prompt-builder.service";
import { findRecognitionOpportunity } from "@/lib/recognition/recognition-opportunity.service";
import { buildRecognitionSnapshot } from "@/lib/recognition/recognition-snapshot.service";

import type {
  BuildLearningLoopInput,
  LearningLoopResult,
} from "./learning-loop-orchestrator.types";

export async function buildLearningLoop(
  input: BuildLearningLoopInput,
): Promise<LearningLoopResult> {
  assertNonEmpty(input.organizationId, "organizationId");

  const snapshot = await buildRecognitionSnapshot({
    organizationId: input.organizationId,
  });
  const opportunity = findRecognitionOpportunity(snapshot);

  return {
    snapshot,
    opportunity,
    prompt: opportunity ? buildAdaptationPrompt(opportunity) : null,
  };
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
