import { buildCompanyModel } from "@/lib/executive-operating-system";
import type { CompanyModel } from "@/lib/executive-operating-system";
import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

const CONFIDENCE_MAP: Record<CompanyModel["confidence"], number> = {
  none: 0.1,
  low: 0.3,
  medium: 0.6,
  high: 0.85,
};

function buildSummary(model: CompanyModel): string {
  const industry = model.industry ?? "unknown";
  const phase = model.growthPhase;
  const constraint = model.cashPriority ?? "unspecified";
  return `Company model: ${industry}. Growth phase: ${phase}. Cash priority: ${constraint}.`;
}

/**
 * runCompanyModelAdapter
 *
 * MemoryContext bu fazda Prisma olmadan erişilemediği için buildCompanyModel(null)
 * çağrılır. Bu builder'ın resmi null path'idir; confidence:"none" sinyaliyle
 * dürüst bir EMPTY_COMPANY_MODEL kopyası döner. Uydurma veri değildir.
 */
export async function runCompanyModelAdapter(
  _input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();

  try {
    const model = buildCompanyModel(null);
    ctx.companyModel = model;
    return {
      module: "company-model",
      success: true,
      summary: buildSummary(model),
      confidence: CONFIDENCE_MAP[model.confidence],
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      module: "company-model",
      success: false,
      summary: null,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "company_model_build_error",
    };
  }
}
