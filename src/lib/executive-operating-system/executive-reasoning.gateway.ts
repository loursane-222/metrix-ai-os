// ExecutiveReasoning için minimal AI gateway seam.
// Raw JSON string döndürür; parse ve validation Faz-8B'ye aittir.
// Hata yutulmaz — çağıran katman yönetir.

import OpenAI from "openai";
import { EXECUTIVE_REASONING_SYSTEM_PROMPT } from "./executive-reasoning.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { ExecutivePhilosophy } from "./executive-philosophy";
import type { ExecutiveWorldModel } from "./executive-world-model.types";
import type { CompanyModel } from "./company-model.types";

const EXECUTIVE_REASONING_MODEL = "gpt-4.1";
const EXECUTIVE_REASONING_MAX_TOKENS = 2000;
const EXECUTIVE_REASONING_TEMPERATURE = 0.2;

export async function generateExecutiveReasoningRaw(
  executiveContext: ExecutiveContextV2,
  companyModel: CompanyModel,
  philosophy: ExecutivePhilosophy,
  worldModel: ExecutiveWorldModel,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const tPromptBuild = performance.now();
  const client = new OpenAI({ apiKey });
  const userContent = JSON.stringify({
    executiveContext,
    companyModel,
    philosophy,
    worldModel,
  });
  const promptBuildMs = Math.round(performance.now() - tPromptBuild);

  const tOpenAI = performance.now();
  let elapsedMs = 0;
  const response = await client.responses.create({
    model: EXECUTIVE_REASONING_MODEL,
    instructions: EXECUTIVE_REASONING_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: EXECUTIVE_REASONING_MAX_TOKENS,
    temperature: EXECUTIVE_REASONING_TEMPERATURE,
    store: false,
  }).finally(() => {
    elapsedMs = Math.round(performance.now() - tOpenAI);
    console.info(
      `[PERF:reasoning] reasoning_prompt_build=${promptBuildMs}ms` +
      ` reasoning_openai_request=${elapsedMs}ms`,
    );
  });
  logOpenAiTelemetry("executive-reasoning", response, elapsedMs);

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("ExecutiveReasoning: LLM boş yanıt döndürdü.");
  }

  return text;
}
