import OpenAI from "openai";
import { REP_REQUEST_PARSER_SYSTEM_PROMPT } from "./rep-request-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { RepRequestExtraction, RepRequestParseInput } from "./rep-request.types";

const REP_REQUEST_PARSER_MODEL = "gpt-4.1-mini";

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullablePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function validateExtraction(raw: unknown): RepRequestExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const customerNameRaw = asNullableString(r.customerNameRaw);
  if (!customerNameRaw) return null;

  return {
    customerNameRaw,
    title: asNullableString(r.title),
    amount: asNullablePositiveNumber(r.amount),
    currency: asNullableString(r.currency),
    notes: asNullableString(r.notes),
    deadlineAt: asNullableString(r.deadlineAt),
  };
}

export async function parseRepRequest(input: RepRequestParseInput): Promise<RepRequestExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: REP_REQUEST_PARSER_MODEL,
    instructions: REP_REQUEST_PARSER_SYSTEM_PROMPT,
    input: `Talep türü: ${input.domain}\n\nMesaj: ${input.message}`,
    max_output_tokens: 400,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("rep-request-parser", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();
  if (!text) return null;

  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  return validateExtraction(parsed);
}
