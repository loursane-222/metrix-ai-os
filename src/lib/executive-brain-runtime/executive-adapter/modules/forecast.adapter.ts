import type { ExecutiveAdapterInput, ExecutiveAdapterModuleResult } from "../executive-adapter.types";
import type { ExecutiveExecutionContext } from "../execution-context.types";

export async function runForecastAdapter(
  input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
): Promise<ExecutiveAdapterModuleResult> {
  const start = Date.now();
  void input;
  void ctx;
  return {
    module: "forecast",
    success: false,
    summary: null,
    confidence: 0,
    durationMs: Date.now() - start,
    error: "module_adapter_stub",
  };
}
