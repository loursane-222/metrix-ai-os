import { buildExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { IntentClarity } from "@/lib/executive-context-builder";
import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

const INTENT_CONFIDENCE_MAP: Record<IntentClarity, number> = {
  clear: 0.85,
  ambiguous: 0.5,
  contradictory: 0.25,
};

function buildSummary(situationSummary: string, weight: string, canProceed: boolean): string {
  return `Executive context: ${situationSummary}. Primary pressure: ${weight}. Readiness: ${canProceed ? "ready" : "blocked"}.`;
}

export async function runExecutiveContextBuilderAdapter(
  input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();

  if (!ctx.conversationUnderstanding) {
    return {
      module: "executive-context-builder",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: "blocked_by_missing_context",
    };
  }

  try {
    const result = await buildExecutiveContextV2({
      message: input.message,
      understanding: ctx.conversationUnderstanding,
    });
    ctx.executiveContext = result;
    return {
      module: "executive-context-builder",
      success: true,
      summary: buildSummary(result.situationSummary, result.weight, result.canProceed),
      confidence: INTENT_CONFIDENCE_MAP[result.intentClarity],
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      module: "executive-context-builder",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "executive_context_builder_error",
    };
  }
}
