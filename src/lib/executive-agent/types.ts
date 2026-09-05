/**
 * Structured evidence + output contracts for the METRIX Executive Agent.
 *
 * Grand Consolidation Operation, section 10: every company-truth tool result
 * is a structured envelope, never bare prose, so the Agent (and anything
 * auditing it later) can tell RESOLVED apart from NOT_FOUND, SOURCE_UNAVAILABLE,
 * CONFLICT, and NO_AUTHORITY_CONFIGURED — and never silently treat a CONFLICT
 * as a number it's free to pick.
 */

export type EvidenceStatus =
  | "RESOLVED"
  | "NOT_FOUND"
  | "SOURCE_UNAVAILABLE"
  | "CONFLICT"
  | "NO_AUTHORITY_CONFIGURED";

export type EvidenceEnvelope<TData = unknown> = Readonly<{
  status: EvidenceStatus;
  factScope: string;
  canonicalEntityId: string | null;
  data: TData | null;
  source: string;
  observedAt: string;
  freshness: "LIVE" | "RECENT" | "STALE" | "UNKNOWN";
  confidence?: number;
  /** Present only when status is CONFLICT or SOURCE_UNAVAILABLE. */
  detail?: string;
}>;

export function resolvedEvidence<TData>(input: {
  factScope: string;
  data: TData;
  source: string;
  canonicalEntityId?: string | null;
  observedAt?: string;
  freshness?: EvidenceEnvelope["freshness"];
  confidence?: number;
}): EvidenceEnvelope<TData> {
  return {
    status: "RESOLVED",
    factScope: input.factScope,
    canonicalEntityId: input.canonicalEntityId ?? null,
    data: input.data,
    source: input.source,
    observedAt: input.observedAt ?? new Date().toISOString(),
    freshness: input.freshness ?? "LIVE",
    confidence: input.confidence,
  };
}

export function unresolvedEvidence(input: {
  status: Exclude<EvidenceStatus, "RESOLVED">;
  factScope: string;
  source: string;
  detail?: string;
}): EvidenceEnvelope<never> {
  return {
    status: input.status,
    factScope: input.factScope,
    canonicalEntityId: null,
    data: null,
    source: input.source,
    observedAt: new Date().toISOString(),
    freshness: "UNKNOWN",
    detail: input.detail,
  };
}

// ---------------------------------------------------------------------------
// Server-side security context — never model-generated (section 18/56).
// ---------------------------------------------------------------------------

export type ExecutiveAgentRunContext = Readonly<{
  organizationId: string;
  actorId: string;
  organizationName: string;
  role: string;
  timeZone: string;
  channel: "voice" | "written";
  conversationId: string;
  requestId: string;
  correlationId: string;
  /** Full AuthContext, for tool implementations that need it verbatim (e.g. executeCanonicalOperation). */
  authContext: import("@/lib/auth/context/auth-context.types").AuthContext;
}>;

// ---------------------------------------------------------------------------
// Structured final output — section 42: fact/inference/judgment separation
// internally, even though METRIX still speaks in ordinary natural language.
// ---------------------------------------------------------------------------

export type ExecutiveAgentUncertainty = Readonly<{
  about: string;
  reason: string;
}>;

export type ExecutiveAgentPriority = Readonly<{
  label: string;
  rationale: string;
  urgency: "low" | "medium" | "high";
}>;

export type ExecutiveAgentStructuredOutput = Readonly<{
  facts: readonly string[];
  inferences: readonly string[];
  judgment: string | null;
  priorities: readonly ExecutiveAgentPriority[];
  recommendedActions: readonly string[];
  uncertainties: readonly ExecutiveAgentUncertainty[];
}>;

export type ExecutiveAgentToolTrace = Readonly<{
  toolName: string;
  startedAt: number;
  durationMs: number;
  status: "ok" | "error";
}>;

export type ExecutiveAgentRunResult = Readonly<{
  text: string;
  structured: ExecutiveAgentStructuredOutput | null;
  toolTraces: readonly ExecutiveAgentToolTrace[];
  turnCount: number;
  usage: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }> | null;
  stopReason: "completed" | "max_turns" | "timeout" | "error";
  errorMessage?: string;
  deliverableArtifact: import("@/lib/artifacts/collections-artifact.service").DeliverableArtifactPayload | null;
}>;
