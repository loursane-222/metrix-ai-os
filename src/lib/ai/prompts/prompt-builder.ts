import { renderPromptTemplate } from "./prompt-renderer";

import type { BuildSystemPromptInput } from "./prompt.types";

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  return renderPromptTemplate({
    templateId: input.templateId ?? "general_conversation",
    organizationSummary: input.organizationSummary,
    memoryContext: input.memoryContext,
    managerAdviceAugmentationContext: input.managerAdviceAugmentationContext,
    executiveBrainContext: input.executiveBrainContext,
    executiveConstitutionContext: input.executiveConstitutionContext,
    executiveCouncilActivation: input.executiveCouncilActivation,
  }).systemPrompt;
}
