import type { ManagerAdviceBrief } from "./manager-advice-brief.types";
import type { ManagerAdviceComposedResponse } from "./manager-advice-composer.types";
import type { ManagerAdviceGuidance } from "./manager-advice-guidance.types";
import type { ManagerAdviceAnalysis } from "./manager-advice-orchestrator.types";
import type { ManagerAdviceResponseDraft } from "./manager-advice-response-builder.types";

export type ManagerAdviceAugmentationContext = {
  analysis: ManagerAdviceAnalysis;
  brief: ManagerAdviceBrief;
  responseDraft: ManagerAdviceResponseDraft;
  composedResponse: ManagerAdviceComposedResponse;
  guidance: ManagerAdviceGuidance;
};

export type BuildManagerAdviceAugmentationContextInput = {
  analysis: ManagerAdviceAnalysis | null | undefined;
  brief: ManagerAdviceBrief | null | undefined;
  responseDraft: ManagerAdviceResponseDraft | null | undefined;
  composedResponse: ManagerAdviceComposedResponse | null | undefined;
};
