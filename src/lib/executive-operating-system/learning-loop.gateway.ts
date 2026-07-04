// LearningLoop için minimal AI gateway seam.
// Raw JSON string döndürür; parse ve validation parser'a aittir.
// Hata yutulmaz — çağıran katman yönetir.

import OpenAI from "openai";
import { LEARNING_LOOP_SYSTEM_PROMPT } from "./learning-loop.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ExecutiveReasoning } from "./executive-reasoning.types";
import type { RecommendedNextMove } from "./recommended-next-move.types";

const LEARNING_LOOP_MODEL = "gpt-4.1";
const LEARNING_LOOP_MAX_TOKENS = 1000;
const LEARNING_LOOP_TEMPERATURE = 0.2;

export async function generateLearningLoopRaw(
  reasoning: ExecutiveReasoning,
  recommendedNextMove: RecommendedNextMove,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });

  const userContent = JSON.stringify({ executiveReasoning: reasoning, recommendedNextMove });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: LEARNING_LOOP_MODEL,
    instructions: LEARNING_LOOP_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: LEARNING_LOOP_MAX_TOKENS,
    temperature: LEARNING_LOOP_TEMPERATURE,
    store: false,
  });
  logOpenAiTelemetry("learning-loop", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("LearningLoop: LLM boş yanıt döndürdü.");
  }

  return text;
}
