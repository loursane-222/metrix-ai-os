import { generateExecutiveReasoningRaw } from "@/lib/executive-operating-system/executive-reasoning.gateway";
import { parseExecutiveReasoning } from "@/lib/executive-operating-system/executive-reasoning.parser";
import { EXECUTIVE_PHILOSOPHY, EXECUTIVE_WORLD_MODEL } from "@/lib/executive-operating-system";
import type { ExecutiveReasoning } from "@/lib/executive-operating-system";
import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

function buildSummary(result: ExecutiveReasoning): string {
  const topRisk = result.risks[0]?.title ?? "none";
  return `Reasoning: ${result.summary}. Top risk: ${topRisk}. Urgency: ${result.timing.urgency}.`;
}

export async function runExecutiveReasoningAdapter(
  _input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();

  if (!ctx.executiveContext) {
    return {
      module: "executive-reasoning",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: "blocked_by_missing_context",
    };
  }

  if (!ctx.companyModel) {
    return {
      module: "executive-reasoning",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: "blocked_by_missing_context",
    };
  }

  try {
    const raw = await generateExecutiveReasoningRaw(
      ctx.executiveContext,
      ctx.companyModel,
      EXECUTIVE_PHILOSOPHY,
      EXECUTIVE_WORLD_MODEL,
    );
    const result = parseExecutiveReasoning(raw);
    ctx.executiveReasoning = result;
    return {
      module: "executive-reasoning",
      success: true,
      summary: buildSummary(result),
      confidence: result.confidence > 0 ? result.confidence : 0.75,
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      module: "executive-reasoning",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "executive_reasoning_error",
    };
  }
}
