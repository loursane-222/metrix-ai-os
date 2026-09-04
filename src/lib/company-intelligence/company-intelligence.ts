import { getConnectorAdapter } from "./connector-gateway";
import { findExternalIdentityForSource } from "./identity-graph";
import { getSourceById } from "./source-registry";
import { emitCompanyIntelligenceTelemetry } from "./telemetry";
import { describeFreshness, resolveTruthAuthority } from "./truth-authority";
import type { TruthProvenance } from "./types";

export type CompanyIntelligenceFactResult =
  | { readonly factScope: string; readonly status: "RESOLVED"; readonly value: unknown; readonly provenance: TruthProvenance }
  | { readonly factScope: string; readonly status: "CONFLICT"; readonly candidateSourceIds: readonly string[] }
  | { readonly factScope: string; readonly status: "SOURCE_UNAVAILABLE"; readonly sourceIds: readonly string[] }
  | { readonly factScope: string; readonly status: "NO_AUTHORITY_CONFIGURED" }
  | { readonly factScope: string; readonly status: "NOT_FOUND" };

export type CompanyIntelligenceResult = {
  readonly organizationId: string;
  readonly canonicalEntityId: string;
  readonly facts: readonly CompanyIntelligenceFactResult[];
  readonly resolvedAt: string;
};

/**
 * The Company Intelligence read flow (canonical entity already resolved by
 * the caller via identity-graph.ts — this function does not itself decide
 * identity, only facts about one already-known entity): for each requested
 * fact scope, Truth Authority picks the one authoritative source, the
 * Connector Gateway resolves that source's adapter, and the adapter is read
 * for exactly that fact — never "read every connected system" (see this
 * module's own scoping: only the sources actually needed for the requested
 * factScopes are ever touched). Distinct fact scopes resolve in parallel;
 * this is deterministic orchestration, not an LLM call.
 */
export async function resolveCompanyIntelligence(request: {
  readonly organizationId: string;
  readonly canonicalEntityId: string;
  readonly factScopes: readonly string[];
}): Promise<CompanyIntelligenceResult> {
  const facts = await Promise.all(request.factScopes.map((factScope) => resolveFact(request.organizationId, request.canonicalEntityId, factScope)));
  emitCompanyIntelligenceTelemetry("CompanyIntelligence", {
    event: "resolution_completed",
    organizationId: request.organizationId,
    canonicalEntityId: request.canonicalEntityId,
    factScopeCount: facts.length,
    resolvedCount: facts.filter((fact) => fact.status === "RESOLVED").length,
  });
  return { organizationId: request.organizationId, canonicalEntityId: request.canonicalEntityId, facts, resolvedAt: new Date().toISOString() };
}

async function resolveFact(organizationId: string, canonicalEntityId: string, factScope: string): Promise<CompanyIntelligenceFactResult> {
  const authority = await resolveTruthAuthority({ organizationId, factScope, applicability: "READ" });
  emitCompanyIntelligenceTelemetry("CompanyIntelligence", { event: "authority_selected", organizationId, canonicalEntityId, factScope, authorityStatus: authority.status });

  if (authority.status === "CONFLICT") return { factScope, status: "CONFLICT", candidateSourceIds: authority.candidateSourceIds };
  if (authority.status === "SOURCE_UNAVAILABLE") return { factScope, status: "SOURCE_UNAVAILABLE", sourceIds: authority.sourceIds };
  if (authority.status === "UNCONFIGURED_NO_SOURCE") return { factScope, status: "NO_AUTHORITY_CONFIGURED" };

  const sourceId = authority.status === "RESOLVED" ? authority.primarySourceId : authority.sourceId;
  const source = await getSourceById(organizationId, sourceId);
  if (!source) return { factScope, status: "SOURCE_UNAVAILABLE", sourceIds: [sourceId] };

  const adapter = getConnectorAdapter(source.provider);
  if (!adapter) {
    emitCompanyIntelligenceTelemetry("CompanyIntelligence", { event: "connector_unavailable", organizationId, canonicalEntityId, factScope, sourceId, provider: source.provider });
    return { factScope, status: "SOURCE_UNAVAILABLE", sourceIds: [sourceId] };
  }

  const identity = await findExternalIdentityForSource(organizationId, canonicalEntityId, sourceId);
  if (!identity) return { factScope, status: "NOT_FOUND" };

  emitCompanyIntelligenceTelemetry("CompanyIntelligence", { event: "connector_invoked", organizationId, canonicalEntityId, factScope, sourceId, provider: source.provider });
  const readResult = await adapter.read({ organizationId, factScope, externalEntityType: identity.externalEntityType, externalEntityId: identity.externalEntityId });

  if (readResult.status === "NOT_FOUND") return { factScope, status: "NOT_FOUND" };
  if (readResult.status === "UNSUPPORTED" || readResult.status === "UNAVAILABLE") return { factScope, status: "SOURCE_UNAVAILABLE", sourceIds: [sourceId] };

  const provenance: TruthProvenance = {
    sourceId,
    provider: source.provider,
    externalEntityId: identity.externalEntityId,
    observedAt: readResult.observedAt,
    freshness: describeFreshness(source),
    authorityRole: "PRIMARY",
    ...(identity.matchConfidence !== null ? { confidence: identity.matchConfidence } : {}),
    canonicalEntityId,
    factScope,
  };
  emitCompanyIntelligenceTelemetry("CompanyIntelligence", { event: "provenance_assembled", organizationId, canonicalEntityId, factScope, sourceId });
  return { factScope, status: "RESOLVED", value: readResult.value, provenance };
}
