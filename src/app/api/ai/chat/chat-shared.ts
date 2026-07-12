import type {
  ExecutiveConversationState,
  ExecutiveMindState,
  ExecutiveMindWorkingMemoryItem,
  ExecutiveMindHypothesis,
  ExecutiveMindBelief,
} from "@/lib/ai/executive-conversation.types";

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
      mindState: parseExecutiveMindState(s["mindState"]),
    };
  } catch (error) {
    console.warn("[ConversationState] conversationState parse failed:", error);
    return null;
  }
}

// Executive Momentum v1 — Sonme (Decay). Reconstructs a clean {id, summary,
// lastReinforcedAt?} object rather than passing the raw item through, so a
// malformed lastReinforcedAt (wrong type) is silently dropped instead of
// reaching the decay math in mergeMindStateList.
function buildMindStateListItem(item: Record<string, unknown>): {
  id: string;
  summary: string;
  lastReinforcedAt?: string;
} {
  return {
    id: item["id"] as string,
    summary: item["summary"] as string,
    ...(typeof item["lastReinforcedAt"] === "string"
      ? { lastReinforcedAt: item["lastReinforcedAt"] as string }
      : {}),
  };
}

// Executive Cognitive Stack v1 — Faz 2. Defensive parse only: this value is
// carried in metadata for observation and is not read by any routing,
// prompt, or decision logic.
function parseExecutiveMindState(raw: unknown): ExecutiveMindState | null {
  if (!raw || typeof raw !== "object") {
    console.info("[cognitive-validation][mind-state]", {
      label: "parse_result",
      parseResult: "null",
    });
    return null;
  }
  const m = raw as Record<string, unknown>;

  const workingMemory: ExecutiveMindWorkingMemoryItem[] = Array.isArray(m["workingMemory"])
    ? (m["workingMemory"] as unknown[]).filter(
        (item): item is ExecutiveMindWorkingMemoryItem =>
          !!item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>)["key"] === "string" &&
          typeof (item as Record<string, unknown>)["value"] === "string",
      )
    : [];

  const hypotheses: ExecutiveMindHypothesis[] = Array.isArray(m["hypotheses"])
    ? (m["hypotheses"] as unknown[])
        .filter(
          (item): item is Record<string, unknown> =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>)["id"] === "string" &&
            typeof (item as Record<string, unknown>)["summary"] === "string",
        )
        .map((item) => buildMindStateListItem(item))
    : [];

  const beliefs: ExecutiveMindBelief[] = Array.isArray(m["beliefs"])
    ? (m["beliefs"] as unknown[])
        .filter(
          (item): item is Record<string, unknown> =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>)["id"] === "string" &&
            typeof (item as Record<string, unknown>)["summary"] === "string",
        )
        .map((item) => buildMindStateListItem(item))
    : [];

  const parsed: ExecutiveMindState = {
    attentionFocus: typeof m["attentionFocus"] === "string" ? m["attentionFocus"] : null,
    workingMemory,
    hypotheses,
    beliefs,
    primaryIntent: typeof m["primaryIntent"] === "string" ? m["primaryIntent"] : null,
    intentConfidence:
      m["intentConfidence"] === "GÜÇLÜ" || m["intentConfidence"] === "ORTA" || m["intentConfidence"] === "TEMKİNLİ"
        ? m["intentConfidence"]
        : null,
  };

  // Executive Cognitive Stack v1 — Faz 4 (Cognitive Validation). Diagnostic-only:
  // booleans/counts, never attentionFocus/hypothesis/belief text.
  console.info("[cognitive-validation][mind-state]", {
    label: "parse_result",
    parseResult: "valid",
    hypothesesCount: parsed.hypotheses?.length ?? 0,
    beliefsCount: parsed.beliefs?.length ?? 0,
    hasAttentionFocus: !!parsed.attentionFocus,
    workingMemoryCount: parsed.workingMemory?.length ?? 0,
  });

  return parsed;
}

export function buildTechnicalRepairUnavailableMessage(): string {
  return "Bunu düzgün cevaplayamadım. Bir cümleyle tekrar yazar mısın?";
}
