import type { ExecutiveLifecycleEnvelope, ExecutiveLifecycleSource } from "./executive-lifecycle.types";

const PHASES: Readonly<Record<ExecutiveLifecycleSource, ReadonlySet<string>>> = Object.freeze({
  action: new Set(["requested", "authorized", "started", "progressed", "succeeded", "failed", "cancelled", "rolled_back", "verified"]),
  approval: new Set(["requested", "awaiting_decision", "approved", "rejected", "expired", "cancelled", "resolution_failed"]),
  draft: new Set(["requested", "created", "updated", "ready", "committed", "discarded", "failed"]),
  document: new Set(["uploaded", "reading", "failed", "cancelled"]),
  extraction: new Set(["extracting", "extracted", "failed", "cancelled"]),
  preview: new Set(["preview_ready", "draft_handoff", "failed", "cancelled"]),
});

export function isExecutiveLifecycleEnvelope(value: unknown): value is ExecutiveLifecycleEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.source !== "string" || !(item.source in PHASES)) return false;
  if (typeof item.phase !== "string" || !PHASES[item.source as ExecutiveLifecycleSource].has(item.phase)) return false;
  return typeof item.envelopeId === "string" && item.envelopeId.length > 0
    && typeof item.timestamp === "number" && Number.isFinite(item.timestamp)
    && typeof item.correlationId === "string" && item.correlationId.length > 0
    && typeof item.sessionId === "string" && item.sessionId.length > 0
    && typeof item.summary === "string" && item.summary.length > 0;
}

export function assertExecutiveLifecycleEnvelope(value: unknown): asserts value is ExecutiveLifecycleEnvelope {
  if (!isExecutiveLifecycleEnvelope(value)) throw new TypeError("Invalid ExecutiveLifecycleEnvelope source/phase contract.");
}
