// ExecutiveContextV2 için minimal AI gateway seam.
// Raw JSON string döndürür; parse ve validation parser'a aittir.
// Hata yutulmaz — çağıran katman yönetir.

import OpenAI from "openai";
import { EXECUTIVE_CONTEXT_V2_SYSTEM_PROMPT } from "./executive-context-builder.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

const EXECUTIVE_CONTEXT_V2_MODEL = "gpt-4.1-mini";
const EXECUTIVE_CONTEXT_V2_MAX_TOKENS = 800;
const EXECUTIVE_CONTEXT_V2_TEMPERATURE = 0;

export async function generateExecutiveContextV2Raw(
  message: string,
  understanding: ConversationUnderstanding,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });

  const userContent = JSON.stringify({ message, understanding });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: EXECUTIVE_CONTEXT_V2_MODEL,
    instructions: EXECUTIVE_CONTEXT_V2_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: EXECUTIVE_CONTEXT_V2_MAX_TOKENS,
    temperature: EXECUTIVE_CONTEXT_V2_TEMPERATURE,
    store: false,
  });
  logOpenAiTelemetry("executive-context-builder", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("ExecutiveContextV2: LLM boş yanıt döndürdü.");
  }

  return text;
}
