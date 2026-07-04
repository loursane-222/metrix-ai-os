import type {
  BuildManagerAdviceAugmentationContextInput,
  ManagerAdviceAugmentationContext,
} from "./manager-advice-augmentation.types";
import { buildManagerAdviceGuidance } from "./manager-advice-guidance.service";

export function buildManagerAdviceAugmentationContext(
  input: BuildManagerAdviceAugmentationContextInput,
): ManagerAdviceAugmentationContext | null {
  if (
    !input.analysis ||
    !input.brief ||
    !input.responseDraft ||
    !input.composedResponse
  ) {
    return null;
  }

  return {
    analysis: input.analysis,
    brief: input.brief,
    responseDraft: input.responseDraft,
    composedResponse: input.composedResponse,
    guidance: buildManagerAdviceGuidance({
      analysis: input.analysis,
      brief: input.brief,
      responseDraft: input.responseDraft,
      composedResponse: input.composedResponse,
    }),
  };
}
