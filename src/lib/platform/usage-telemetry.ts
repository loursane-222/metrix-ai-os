import { db } from "../db";

export const USAGE_PRICING_VERSION = "openai-2026-09-19";
const MILLION = 1_000_000n;

export type MeasuredUsage = { model: string; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningTokens?: number; audioInputTokens?: number; audioOutputTokens?: number; liveSeconds?: number };

/** Official rate card snapshot: GPT-5.6 Sol $4/$0.40/$20 per MTok;
 * GPT-Live-1 $0.05/minute, billed per second. Amount is USD cents. */
export function calculateUsageCostCents(usage: MeasuredUsage): bigint | null {
  if (usage.model === "gpt-5.6-sol") {
    const input = BigInt(usage.inputTokens ?? 0); const cached = BigInt(usage.cachedInputTokens ?? 0); const output = BigInt(usage.outputTokens ?? 0);
    if (cached > input) return null;
    // OpenAI prices a prompt over 272K input tokens at 2x input (including
    // cached input) and 1.5x output for the full request. This snapshot is
    // deliberately versioned with the persisted event below.
    const longContext = input > 272_000n;
    const inputRate = longContext ? 800n : 400n;
    const cachedInputRate = longContext ? 80n : 40n;
    const outputRate = longContext ? 3000n : 2000n;
    return ((input - cached) * inputRate + cached * cachedInputRate + output * outputRate) / MILLION;
  }
  if (usage.model === "gpt-live-1" && usage.liveSeconds !== undefined) return BigInt(usage.liveSeconds) * 5n / 60n;
  return null;
}

export async function persistUsageEvent(input: MeasuredUsage & { userId: string; organizationId: string; surface: "TEXT" | "VOICE"; requestId?: string; createdAt?: Date }): Promise<void> {
  const costCents = calculateUsageCostCents(input);
  try {
    const data = { userId: input.userId, organizationId: input.organizationId, surface: input.surface, model: input.model, inputTokens: input.inputTokens, outputTokens: input.outputTokens, cachedInputTokens: input.cachedInputTokens, reasoningTokens: input.reasoningTokens, audioInputTokens: input.audioInputTokens, audioOutputTokens: input.audioOutputTokens, liveSeconds: input.liveSeconds, costCents, currency: "USD", pricingVersion: costCents === null ? null : USAGE_PRICING_VERSION, requestId: input.requestId, createdAt: input.createdAt };
    if (input.requestId) await db.usageEvent.upsert({ where: { requestId: input.requestId }, create: data, update: {} });
    else await db.usageEvent.create({ data });
  } catch (error) { console.error("[metrix] usage telemetry persistence failed", { surface: input.surface, model: input.model, requestId: input.requestId, error: error instanceof Error ? error.name : "unknown" }); }
}

function usageDetailValue(details: Record<string, number> | Array<Record<string, number>>, key: string): number {
  return (Array.isArray(details) ? details : [details]).reduce((total, detail) => total + (detail[key] ?? 0), 0);
}

export function persistTextRunUsage(
  input: { userId: string; organizationId: string; turnId: string; rawResponses?: unknown },
  persist: (event: Parameters<typeof persistUsageEvent>[0]) => Promise<void> | void = persistUsageEvent
): void {
  if (!Array.isArray(input.rawResponses)) return;

  input.rawResponses.forEach((response, index) => {
    try {
      if (typeof response !== "object" || response === null) return;
      const candidate = response as { requestId?: unknown; usage?: { inputTokens?: unknown; outputTokens?: unknown; inputTokensDetails?: unknown; outputTokensDetails?: unknown } };
      const usage = candidate.usage;
      if (!usage || typeof usage.inputTokens !== "number" || !Number.isFinite(usage.inputTokens) || typeof usage.outputTokens !== "number" || !Number.isFinite(usage.outputTokens)) return;
      const inputDetails = usage.inputTokensDetails;
      const outputDetails = usage.outputTokensDetails;
      if (!inputDetails || !outputDetails || (typeof inputDetails !== "object") || (typeof outputDetails !== "object")) return;
      const cached = usageDetailValue(inputDetails as Record<string, number> | Array<Record<string, number>>, "cached_tokens");
      const reasoning = usageDetailValue(outputDetails as Record<string, number> | Array<Record<string, number>>, "reasoning_tokens");
      const event = { userId: input.userId, organizationId: input.organizationId, surface: "TEXT" as const, model: "gpt-5.6-sol", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: cached, reasoningTokens: reasoning, requestId: typeof candidate.requestId === "string" ? candidate.requestId : `${input.turnId}:${index}` };
      void Promise.resolve(persist(event)).catch(() => undefined);
    } catch {
      // Raw provider telemetry is never trusted to control a business turn.
    }
  });
}
