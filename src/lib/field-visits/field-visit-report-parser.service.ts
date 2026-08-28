import OpenAI from "openai";
import { FIELD_VISIT_REPORT_PARSER_SYSTEM_PROMPT } from "./field-visit-report-parser.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type {
  FieldVisitOrderIntent,
  FieldVisitPaymentIntent,
  FieldVisitReportExtraction,
  FieldVisitReportParseInput,
  FieldVisitRequestTypeExtracted,
} from "./field-visit-report-parser.types";

const FIELD_VISIT_REPORT_PARSER_MODEL = "gpt-4.1-mini";

const VALID_REQUEST_TYPES: FieldVisitRequestTypeExtracted[] = ["DISPLAY_REQUEST", "SAMPLE_REQUEST", "OTHER"];

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validateOrderIntent(value: unknown): FieldVisitOrderIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const productRef = asNullableString(item.productRef);
  const quantity = asNullableNumber(item.quantity);
  if (productRef === null && quantity === null) return null;
  return { productRef, quantity };
}

function validatePaymentIntent(value: unknown): FieldVisitPaymentIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const amount = asNullableNumber(item.amount);
  if (amount === null || amount <= 0) return null;
  const currency = asNullableString(item.currency) ?? "TRY";
  return { amount, currency };
}

function validateExtraction(raw: unknown): FieldVisitReportExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const customerNameRaw = asNullableString(r.customerNameRaw);
  if (!customerNameRaw) return null;
  if (typeof r.notes !== "string") return null;
  if (!Array.isArray(r.requestTypes)) return null;

  return {
    customerNameRaw,
    contactNameRaw: asNullableString(r.contactNameRaw),
    startTime: asNullableString(r.startTime),
    endTime: asNullableString(r.endTime),
    notes: r.notes,
    requestTypes: r.requestTypes.filter((t): t is FieldVisitRequestTypeExtracted =>
      typeof t === "string" && VALID_REQUEST_TYPES.includes(t as FieldVisitRequestTypeExtracted)),
    orderIntent: validateOrderIntent(r.orderIntent),
    paymentIntent: validatePaymentIntent(r.paymentIntent),
  };
}

export async function parseFieldVisitReport(
  input: FieldVisitReportParseInput,
): Promise<FieldVisitReportExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

  const userContent = `Referans tarih: ${input.referenceDate}\n\nSaha temsilcisinin mesajı:\n${input.message}`;

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: FIELD_VISIT_REPORT_PARSER_MODEL,
    instructions: FIELD_VISIT_REPORT_PARSER_SYSTEM_PROMPT,
    input: userContent,
    max_output_tokens: 600,
    temperature: 0,
    store: false,
  });
  logOpenAiTelemetry("field-visit-report-parser", response, Math.round(performance.now() - tOpenAI));

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
