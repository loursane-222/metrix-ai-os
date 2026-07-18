import { buildExecutiveContextV2 } from "@/lib/executive-context-builder";
import {
  buildCompanyModel,
  buildExecutiveOperatingSystem,
} from "@/lib/executive-operating-system";
import type {
  BuildExecutiveIntelligenceInput,
  ExecutiveIntelligenceDiagnostics,
  ExecutiveIntelligenceResult,
  StepDiagnostic,
} from "./executive-intelligence.types";

const STEP_SUCCESS: StepDiagnostic = { status: "success" };
const STEP_SKIPPED: StepDiagnostic = { status: "skipped" };

export async function buildExecutiveIntelligence(
  input: BuildExecutiveIntelligenceInput,
): Promise<ExecutiveIntelligenceResult> {
  const { message, memoryContext, generatedAt, understanding } = input;
  const requiresExecutiveReasoning = understanding.shouldInvokeExecutiveBrain;

  if (!requiresExecutiveReasoning) {
    return {
      understanding,
      executiveOperatingSystem: null,
      diagnostics: {
        requiresExecutiveReasoning: false,
        skippedReason: understanding.reasoning.summary,
        understanding: STEP_SUCCESS,
        context: STEP_SKIPPED,
        companyModel: STEP_SKIPPED,
        eos: STEP_SKIPPED,
      },
    };
  }

  const diagnostics: ExecutiveIntelligenceDiagnostics = {
    requiresExecutiveReasoning: true,
    skippedReason: null,
    understanding: STEP_SUCCESS,
    context: STEP_SKIPPED,
    companyModel: STEP_SKIPPED,
    eos: STEP_SKIPPED,
  };

  let executiveContext: Awaited<ReturnType<typeof buildExecutiveContextV2>>;
  const t2 = performance.now();
  try {
    executiveContext = await buildExecutiveContextV2({ message, understanding }).finally(() => {
      console.info(`[PERF:ei] ei_build_context=${Math.round(performance.now() - t2)}ms`);
    });
    diagnostics.context = STEP_SUCCESS;
  } catch (err) {
    diagnostics.context = {
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    throw err;
  }

  let companyModel: ReturnType<typeof buildCompanyModel>;
  try {
    companyModel = buildCompanyModel(memoryContext, input.authorityProjections);
    diagnostics.companyModel = STEP_SUCCESS;
  } catch (err) {
    diagnostics.companyModel = {
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    throw err;
  }

  let executiveOperatingSystem: Awaited<ReturnType<typeof buildExecutiveOperatingSystem>>;
  try {
    executiveOperatingSystem = await buildExecutiveOperatingSystem({
      executiveContext,
      companyModel,
      generatedAt,
      learningPersistenceContext: input.organizationId
        ? { organizationId: input.organizationId }
        : undefined,
    });
    diagnostics.eos = STEP_SUCCESS;
  } catch (err) {
    diagnostics.eos = {
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    throw err;
  }

  return {
    understanding,
    executiveOperatingSystem,
    diagnostics,
  };
}
