import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

import { ExecutiveRequestResolutionValidationError } from "./executive-request-resolution.errors";
import { resolveExecutiveRequest } from "./executive-request-resolution.service";
import type {
  CapabilityAuthorityOutcome,
  ExecutiveRequestResolution,
  ExecutiveRequestResolutionStatus,
  ExecutiveRequestResolver,
} from "./executive-request-resolution.types";
import type { ExecutionMode, ExecutionStrategy } from "./execution-strategy";

const SHADOW_LOG_LABEL = "[executive-request-resolution][shadow]";

export type ShadowResolutionOutcome =
  | "success"
  | "validation_error"
  | "resolver_error"
  | "skipped_fast_path";

export type ShadowResolutionDiagnostic = Readonly<{
  requestId: string;
  channel: "text" | "voice";
  resolutionStatus: ExecutiveRequestResolutionStatus | null;
  primaryCapabilityId: string | null;
  candidateCapabilityCount: number;
  executionStrategy: ExecutionStrategy | null;
  executionMode: ExecutionMode | null;
  blockingMissingInformationCount: number;
  providerIds: readonly string[];
  providerCount: number;
  capabilityAuthorityOutcome: CapabilityAuthorityOutcome | null;
  durationMs: number;
  outcome: ShadowResolutionOutcome;
}>;

export type ShadowDiagnosticLogger = (
  label: typeof SHADOW_LOG_LABEL,
  diagnostic: ShadowResolutionDiagnostic,
) => void;

export type ObserveShadowResolutionInput = Readonly<{
  requestId: string;
  channel: "text" | "voice";
  organizationId: string;
  understanding: ConversationUnderstanding;
  resolver: ExecutiveRequestResolver<ConversationUnderstanding>;
  now?: () => number;
  log?: ShadowDiagnosticLogger;
}>;

export async function observeShadowExecutiveRequestResolution(
  input: ObserveShadowResolutionInput,
): Promise<ShadowResolutionDiagnostic> {
  const now = input.now ?? performance.now.bind(performance);
  const startedAt = now();

  try {
    const resolution = await resolveExecutiveRequest({
      requestId: input.requestId,
      organizationId: input.organizationId,
      understanding: input.understanding,
    }, input.resolver);
    const diagnostic = buildSuccessDiagnostic(input, resolution, now() - startedAt);
    safeLog(input.log ?? defaultLog, diagnostic);
    return diagnostic;
  } catch (error) {
    const diagnostic = emptyDiagnostic(
      input.requestId,
      input.channel,
      error instanceof ExecutiveRequestResolutionValidationError ? "validation_error" : "resolver_error",
      now() - startedAt,
    );
    safeLog(input.log ?? defaultLog, diagnostic);
    return diagnostic;
  }
}

export function recordShadowFastPathSkip(input: {
  requestId: string;
  log?: ShadowDiagnosticLogger;
}): ShadowResolutionDiagnostic {
  const diagnostic = emptyDiagnostic(input.requestId, "voice", "skipped_fast_path", 0);
  safeLog(input.log ?? defaultLog, diagnostic);
  return diagnostic;
}

function buildSuccessDiagnostic(
  input: ObserveShadowResolutionInput,
  resolution: ExecutiveRequestResolution<ConversationUnderstanding>,
  durationMs: number,
): ShadowResolutionDiagnostic {
  const primary = resolution.capabilities.find((capability) => capability.role === "PRIMARY") ?? null;
  const providerIds = [...new Set(resolution.capabilities.map((capability) => capability.providerId))];
  return {
    requestId: input.requestId,
    channel: input.channel,
    resolutionStatus: resolution.status,
    primaryCapabilityId: primary?.capabilityId ?? null,
    candidateCapabilityCount: resolution.capabilities.filter(
      (capability) => capability.role === "CANDIDATE",
    ).length,
    executionStrategy: resolution.executionStrategy,
    executionMode: resolution.executionMode,
    blockingMissingInformationCount: resolution.missingInformation.filter((item) => item.blocking).length,
    providerIds,
    providerCount: providerIds.length,
    capabilityAuthorityOutcome: resolution.capabilityAuthority.outcome,
    durationMs: Math.max(0, durationMs),
    outcome: "success",
  };
}

function emptyDiagnostic(
  requestId: string,
  channel: "text" | "voice",
  outcome: Exclude<ShadowResolutionOutcome, "success">,
  durationMs: number,
): ShadowResolutionDiagnostic {
  return {
    requestId,
    channel,
    resolutionStatus: null,
    primaryCapabilityId: null,
    candidateCapabilityCount: 0,
    executionStrategy: null,
    executionMode: null,
    blockingMissingInformationCount: 0,
    providerIds: [],
    providerCount: 0,
    capabilityAuthorityOutcome: null,
    durationMs: Math.max(0, durationMs),
    outcome,
  };
}

function defaultLog(
  label: typeof SHADOW_LOG_LABEL,
  diagnostic: ShadowResolutionDiagnostic,
): void {
  console.info(label, diagnostic);
}

function safeLog(
  log: ShadowDiagnosticLogger,
  diagnostic: ShadowResolutionDiagnostic,
): void {
  try {
    log(SHADOW_LOG_LABEL, diagnostic);
  } catch {
    // Diagnostics must never alter request success or response behavior.
  }
}
