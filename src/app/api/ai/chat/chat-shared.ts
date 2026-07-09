import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";

// Shared between route.ts (the /api/ai/chat handler) and
// voice-v4-orchestrator.ts (the voice V4 Fast Presence / Conversation
// Continuity branch). Lives in its own module specifically so neither file
// has to import the other — route.ts is a Next.js route entrypoint and
// should not be imported as a library module, and voice-v4-orchestrator.ts
// is imported BY route.ts, so importing back from it would be circular.

// Diagnostic-only: timing and numeric/short-string identifiers, never user
// message content, prompts, tokens, cookies, auth headers, or env values.
// Logs unconditionally (unlike createRequestProfiler's finish(), which is
// silenced in production unless PERF_PROFILING_ENABLED is set) so this is
// visible in the exact environment the 10-20s delay was observed in.
export type ChatLatencyExtra = Record<string, number | string | boolean | undefined>;

export function logChatLatency(
  requestId: string,
  requestStartAt: number,
  label: string,
  extra?: ChatLatencyExtra,
): void {
  const now = performance.now();
  console.info("[api/ai/chat][latency]", {
    label,
    requestId,
    elapsedMs: Math.round(now - requestStartAt),
    at: now,
    ...extra,
  });
}

export function extractConversationState(
  metadata: unknown,
): ExecutiveConversationState | null {
  try {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata as Record<string, unknown>;
    const state = raw["conversationState"];
    if (!state || typeof state !== "object") return null;
    const s = state as Record<string, unknown>;
    if (typeof s["phase"] !== "string") return null;
    return {
      phase: s["phase"] as ExecutiveConversationState["phase"],
      lastRecommendationTitle: typeof s["lastRecommendationTitle"] === "string" ? s["lastRecommendationTitle"] : null,
      lastRecommendationRationale: typeof s["lastRecommendationRationale"] === "string" ? s["lastRecommendationRationale"] : null,
      lastObjectionType: typeof s["lastObjectionType"] === "string" ? s["lastObjectionType"] : null,
      objectionCount: typeof s["objectionCount"] === "number" ? s["objectionCount"] : 0,
      clarifyingQuestion: typeof s["clarifyingQuestion"] === "string" ? s["clarifyingQuestion"] : null,
      commitmentRequest: typeof s["commitmentRequest"] === "string" ? s["commitmentRequest"] : null,
      isRevisionRequired: typeof s["isRevisionRequired"] === "boolean" ? s["isRevisionRequired"] : false,
      committedTitle: typeof s["committedTitle"] === "string" ? s["committedTitle"] : null,
      committedAt: typeof s["committedAt"] === "string" ? s["committedAt"] : null,
      followUpDueAt: typeof s["followUpDueAt"] === "string" ? s["followUpDueAt"] : null,
      commitmentOutcome:
        s["commitmentOutcome"] === "SUCCESS" ||
        s["commitmentOutcome"] === "FAILURE" ||
        s["commitmentOutcome"] === "ABANDONED"
          ? s["commitmentOutcome"]
          : null,
      updatedAt: typeof s["updatedAt"] === "string" ? s["updatedAt"] : new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[ConversationState] conversationState parse failed:", error);
    return null;
  }
}

export function buildTechnicalRepairUnavailableMessage(): string {
  return "Bunu düzgün cevaplayamadım. Bir cümleyle tekrar yazar mısın?";
}
