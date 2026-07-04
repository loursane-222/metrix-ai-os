import type { AiCostTrackingMetadata } from "@/lib/ai/ai.types";
import type { AiProviderUsage } from "@/lib/ai/providers/ai-provider";

export function buildCostTrackingMetadata(
  usage: AiProviderUsage | undefined,
): AiCostTrackingMetadata | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: null,
    currency: "USD",
  };
}

