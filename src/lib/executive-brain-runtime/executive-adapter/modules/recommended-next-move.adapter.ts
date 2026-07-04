import { generateRecommendedNextMoveRaw } from "@/lib/executive-operating-system/recommended-next-move.gateway";
import { parseRecommendedNextMove } from "@/lib/executive-operating-system";
import type { RecommendedNextMove, NextMoveConfidence } from "@/lib/executive-operating-system";
import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

const CONFIDENCE_MAP: Record<NextMoveConfidence, number> = {
  low: 0.3,
  medium: 0.65,
  high: 0.9,
};

function buildSummary(result: RecommendedNextMove): string {
  return `Recommended action: ${result.title}. Expected impact: ${result.expectedImpact}. Timing: ${result.timeframe}.`;
}

export async function runRecommendedNextMoveAdapter(
  _input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();

  if (!ctx.executiveReasoning) {
    return {
      module: "recommended-next-move",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: "blocked_by_missing_context",
    };
  }

  try {
    const raw = await generateRecommendedNextMoveRaw(ctx.executiveReasoning);
    const result = parseRecommendedNextMove(raw);
    ctx.recommendedNextMove = result;
    return {
      module: "recommended-next-move",
      success: true,
      summary: buildSummary(result),
      confidence: CONFIDENCE_MAP[result.confidence],
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      module: "recommended-next-move",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "recommended_next_move_error",
    };
  }
}
