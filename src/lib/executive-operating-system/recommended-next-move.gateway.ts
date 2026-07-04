// RecommendedNextMove için minimal AI gateway seam.
// Raw JSON string döndürür; parse ve validation parser'a aittir.
// Hata yutulmaz — çağıran katman yönetir.

import OpenAI from "openai";
import { RECOMMENDED_NEXT_MOVE_SYSTEM_PROMPT } from "./recommended-next-move.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ExecutiveReasoning } from "./executive-reasoning.types";

const RECOMMENDED_NEXT_MOVE_MODEL = "gpt-4.1";
const RECOMMENDED_NEXT_MOVE_MAX_TOKENS = 1000;
const RECOMMENDED_NEXT_MOVE_TEMPERATURE = 0.2;

export async function generateRecommendedNextMoveRaw(
  reasoning: ExecutiveReasoning,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });

  const userContent = JSON.stringify({ reasoning });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: RECOMMENDED_NEXT_MOVE_MODEL,
    instructions: RECOMMENDED_NEXT_MOVE_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: RECOMMENDED_NEXT_MOVE_MAX_TOKENS,
    temperature: RECOMMENDED_NEXT_MOVE_TEMPERATURE,
    store: false,
  });
  logOpenAiTelemetry("recommended-next-move", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("RecommendedNextMove: LLM boş yanıt döndürdü.");
  }

  return text;
}
