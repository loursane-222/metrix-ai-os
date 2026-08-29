import OpenAI from "openai";
import { REPORT_ANSWER_PARSER_SYSTEM_PROMPT } from "./report-answer-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { ReportAnswerExtracted, ReportAnswerParseInput } from "./report-answer-parser.types";

const REPORT_ANSWER_PARSER_MODEL = "gpt-4.1-mini";

function validateExtraction(raw: unknown, validKeys: ReadonlySet<string>): ReportAnswerExtracted[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.answers)) return [];

  const answers: ReportAnswerExtracted[] = [];
  for (const item of r.answers) {
    if (!item || typeof item !== "object") continue;
    const key = (item as Record<string, unknown>).key;
    const value = (item as Record<string, unknown>).value;
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (!validKeys.has(key)) continue;
    if (!value.trim()) continue;
    answers.push({ key, value: value.trim() });
  }
  return answers;
}

export async function parseReportAnswers(input: ReportAnswerParseInput): Promise<ReportAnswerExtracted[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || input.questions.length === 0) return [];

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const questionList = input.questions.map((question) => `[${question.key}] ${question.label}`).join("\n");
  const userContent = `Açık sorular:\n${questionList}\n\nMesaj: ${input.message}`;

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: REPORT_ANSWER_PARSER_MODEL,
    instructions: REPORT_ANSWER_PARSER_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: 800,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("report-answer-parser", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();
  if (!text) return [];

  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const validKeys = new Set(input.questions.map((question) => question.key));
  return validateExtraction(parsed, validKeys);
}
