import type { RecognitionOpportunity } from "@/lib/recognition/recognition-snapshot.types";
import type { AdaptationPrompt } from "./adaptation-prompt.types";

const ADAPTATION_PROMPT_TITLE = "Sizi daha iyi tanımak istiyorum";
const ADAPTATION_PROMPT_PREFIX =
  "Sizi daha iyi anlayabilmem için bir şey merak ediyorum.";

export function buildAdaptationPrompt(
  opportunity: RecognitionOpportunity,
): AdaptationPrompt {
  return {
    title: ADAPTATION_PROMPT_TITLE,
    message: `${ADAPTATION_PROMPT_PREFIX} ${opportunity.suggestedQuestion}`,
    opportunityKey: opportunity.key,
  };
}
