import { generateWithAiGateway } from "./gateway/ai-gateway";

import type {
  GenerateAiResponseInput,
  GenerateAiResponseResult,
} from "./ai.types";

export async function generateAiResponse(
  input: GenerateAiResponseInput,
): Promise<GenerateAiResponseResult> {
  return generateWithAiGateway(input);
}
