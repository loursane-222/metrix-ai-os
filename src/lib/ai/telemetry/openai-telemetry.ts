// OpenAI Responses API telemetry helper.
// Tüm gateway'lerden çağrılır; kod tekrarını önler.
// Davranış değişmez — sadece console.info çağrısı yapar.

import type { Response } from "openai/resources/responses/responses";

export function logOpenAiTelemetry(
  label: string,
  response: Response,
  elapsedMs: number,
): void {
  const u = response.usage;

  const lines: string[] = [
    `[OPENAI TELEMETRY] ${label}`,
    `  request_id=${response.id}`,
    `  model=${response.model}`,
    `  status=${response.status ?? "unknown"}`,
    `  service_tier=${response.service_tier ?? "null"}`,
    `  elapsed_ms=${elapsedMs}`,
    `  created_at=${response.created_at}`,
    `  completed_at=${response.completed_at ?? "null"}`,
    `  input_tokens=${u?.input_tokens ?? "null"}`,
    `  output_tokens=${u?.output_tokens ?? "null"}`,
    `  total_tokens=${u?.total_tokens ?? "null"}`,
    `  cached_tokens=${u?.input_tokens_details?.cached_tokens ?? "null"}`,
    `  reasoning_tokens=${u?.output_tokens_details?.reasoning_tokens ?? "null"}`,
  ];

  if (response.incomplete_details) {
    lines.push(`  incomplete_reason=${response.incomplete_details.reason ?? "unknown"}`);
  }

  if (response.error) {
    lines.push(`  error=${JSON.stringify(response.error)}`);
  }

  console.info(lines.join("\n"));
}
