import { classifyConversation } from "@/lib/conversation-understanding";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

const CONFIDENCE_MAP: Record<ConversationUnderstanding["confidence"], number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
};

function buildSummary(result: ConversationUnderstanding): string {
  return `User intent: ${result.userMotivation}. Situation: ${result.conversationKind}. Recommended handling: ${result.suggestedHandling}.`;
}

export async function runConversationUnderstandingAdapter(
  input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();
  try {
    const result = await classifyConversation({
      message: input.message,
      recentMessages: input.recentMessages,
    });
    ctx.conversationUnderstanding = result;
    return {
      module: "conversation-understanding",
      success: true,
      summary: buildSummary(result),
      confidence: CONFIDENCE_MAP[result.confidence],
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      module: "conversation-understanding",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "conversation_understanding_error",
    };
  }
}
