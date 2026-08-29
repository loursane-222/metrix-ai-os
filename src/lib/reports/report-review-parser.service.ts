import OpenAI from "openai";
import { REPORT_REVIEW_PARSER_SYSTEM_PROMPT } from "./report-review-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ReportReviewExtraction, ReportReviewParseInput } from "./report-review-parser.types";

const REPORT_REVIEW_PARSER_MODEL = "gpt-4.1-mini";

function validateExtraction(raw: unknown): ReportReviewExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const repNameRaw = typeof r.repNameRaw === "string" ? r.repNameRaw.trim() : "";
  if (!repNameRaw) return null;
  if (r.decision !== "APPROVED" && r.decision !== "NEEDS_REVISION") return null;
  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim() : null;

  return { repNameRaw, decision: r.decision, note };
}

export async function parseReportReview(input: ReportReviewParseInput): Promise<ReportReviewExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: REPORT_REVIEW_PARSER_MODEL,
    instructions: REPORT_REVIEW_PARSER_SYSTEM_PROMPT,
    input: input.message,
    max_output_tokens: 300,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("report-review-parser", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();
  if (!text || text === "null") return null;

  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  return validateExtraction(parsed);
}
