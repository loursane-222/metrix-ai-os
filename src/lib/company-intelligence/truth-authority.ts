import { isSourceHealthy, listSources, sourceSupportsFactScope } from "./source-registry";
import { describeFreshnessFromTimestamp, resolveTruthAuthorityFromCandidates, type AuthorityCandidateRule } from "./truth-authority-resolution";
import type { ConnectorSourceDescriptor, TruthApplicability, TruthAuthorityResolution } from "./types";

export async function resolveTruthAuthority(params: {
  readonly organizationId: string;
  readonly factScope: string;
  readonly applicability: TruthApplicability;
}): Promise<TruthAuthorityResolution> {
  const sources = await listSources(params.organizationId);
  const capable = sources.filter((source) => sourceSupportsFactScope(source, params.factScope, params.applicability));
  const healthy = capable.filter(isSourceHealthy);
  const unhealthy = capable.filter((source) => !isSourceHealthy(source));

  const rules: AuthorityCandidateRule[] = [];
  for (const source of healthy) {
    for (const rule of source.authoritativeScopes) {
      if (rule.factScope !== params.factScope) continue;
      if (rule.applicability !== "BOTH" && rule.applicability !== params.applicability) continue;
      rules.push({ sourceId: source.id, role: rule.role });
    }
  }

  return resolveTruthAuthorityFromCandidates({
    rules,
    healthyEligibleSourceIds: healthy.map((source) => source.id),
    unhealthyEligibleSourceIds: unhealthy.map((source) => source.id),
  });
}

export function describeFreshness(source: ConnectorSourceDescriptor, now: Date = new Date()): "LIVE" | "RECENT" | "STALE" | "UNKNOWN" {
  return describeFreshnessFromTimestamp(source.lastObservedAt ?? source.lastSuccessfulSyncAt, now);
}
