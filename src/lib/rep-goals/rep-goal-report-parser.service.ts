import OpenAI from "openai";
import { REP_GOAL_REPORT_PARSER_SYSTEM_PROMPT } from "./rep-goal-report-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { RepGoalReportExtraction, RepGoalReportParseInput } from "./rep-goal-report-parser.types";

const REP_GOAL_REPORT_PARSER_MODEL = "gpt-4.1-mini";

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullablePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function validateExtraction(raw: unknown): RepGoalReportExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const repNameRaw = asNullableString(r.repNameRaw);
  if (!repNameRaw) return null;

  const visitTarget = asNullablePositiveNumber(r.visitTarget);
  const salesTarget = asNullablePositiveNumber(r.salesTarget);
  const collectionTarget = asNullablePositiveNumber(r.collectionTarget);
  if (visitTarget === null && salesTarget === null && collectionTarget === null) return null;

  return { repNameRaw, visitTarget, salesTarget, collectionTarget };
}

export async function parseRepGoalReport(input: RepGoalReportParseInput): Promise<RepGoalReportExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: REP_GOAL_REPORT_PARSER_MODEL,
    instructions: REP_GOAL_REPORT_PARSER_SYSTEM_PROMPT,
    input: input.message,
    max_output_tokens: 400,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("rep-goal-report-parser", response, Math.round(performance.now() - tOpenAI));

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
