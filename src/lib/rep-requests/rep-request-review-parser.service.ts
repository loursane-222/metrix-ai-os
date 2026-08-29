import OpenAI from "openai";
import { REP_REQUEST_REVIEW_PARSER_SYSTEM_PROMPT } from "./rep-request-review-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type { RepRequestDomain, RepRequestReviewExtraction, RepRequestReviewParseInput } from "./rep-request.types";

const REP_REQUEST_REVIEW_PARSER_MODEL = "gpt-4.1-mini";
const VALID_DOMAINS: readonly RepRequestDomain[] = ["ORDER", "QUOTE", "PAYMENT"];

function validateExtraction(raw: unknown): RepRequestReviewExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const repNameRaw = typeof r.repNameRaw === "string" ? r.repNameRaw.trim() : "";
  if (!repNameRaw) return null;
  if (r.decision !== "APPROVE" && r.decision !== "REJECT") return null;
  const domain = typeof r.domain === "string" && VALID_DOMAINS.includes(r.domain as RepRequestDomain) ? (r.domain as RepRequestDomain) : null;
  const entityReference = typeof r.entityReference === "string" && r.entityReference.trim() ? r.entityReference.trim() : null;

  return { repNameRaw, decision: r.decision, domain, entityReference };
}

export async function parseRepRequestReview(input: RepRequestReviewParseInput): Promise<RepRequestReviewExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: REP_REQUEST_REVIEW_PARSER_MODEL,
    instructions: REP_REQUEST_REVIEW_PARSER_SYSTEM_PROMPT,
    input: input.message,
    max_output_tokens: 300,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("rep-request-review-parser", response, Math.round(performance.now() - tOpenAI));

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
