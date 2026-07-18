export type ResolutionConfidenceLevel = "low" | "medium" | "high";

export type ResolutionConfidence = Readonly<{
  level: ResolutionConfidenceLevel;
  score?: number;
}>;

export type OrganizationScope = Readonly<{
  organizationId: string;
}>;

export type EntityReference = Readonly<{
  organizationId: string;
  entityType: string;
  entityId: string;
}>;

export type EntityVerificationSource =
  | "REQUEST"
  | "CONVERSATION"
  | "PAGE_CONTEXT"
  | "DOMAIN_LOOKUP"
  | (string & Record<never, never>);

export type EntityFreshness = Readonly<{
  verifiedAt: string | null;
  maxAgeMs: number | null;
}>;

export type EntityResolutionCandidate = Readonly<{
  reference: EntityReference;
  verificationSource: EntityVerificationSource;
  confidence: ResolutionConfidence;
  freshness: EntityFreshness;
  contractVersion: string;
}>;

type EntityResolutionBase = Readonly<{
  organizationId: string;
  requestedEntityType: string;
  verificationSource: EntityVerificationSource | null;
  confidence: ResolutionConfidence;
  freshness: EntityFreshness;
  contractVersion: string;
}>;

export type ResolvedEntity =
  | (EntityResolutionBase & Readonly<{
      status: "RESOLVED";
      reference: EntityReference;
      candidates: readonly EntityResolutionCandidate[];
    }>)
  | (EntityResolutionBase & Readonly<{
      status: "AMBIGUOUS";
      reference: null;
      candidates: readonly [EntityResolutionCandidate, EntityResolutionCandidate, ...EntityResolutionCandidate[]];
    }>)
  | (EntityResolutionBase & Readonly<{
      status: "MISSING" | "INVALID";
      reference: null;
      candidates: readonly EntityResolutionCandidate[];
    }>);

/** Throws when an entity or candidate escapes the request organization. */
export function assertEntityOrganizationScope(
  entity: ResolvedEntity,
  expectedOrganizationId: string,
): void {
  const organizationIds = [
    entity.organizationId,
    ...(entity.reference ? [entity.reference.organizationId] : []),
    ...entity.candidates.map((candidate) => candidate.reference.organizationId),
  ];

  if (organizationIds.some((organizationId) => organizationId !== expectedOrganizationId)) {
    throw new EntityOrganizationScopeError(expectedOrganizationId, organizationIds);
  }
}

export class EntityOrganizationScopeError extends Error {
  readonly expectedOrganizationId: string;
  readonly actualOrganizationIds: readonly string[];

  constructor(expectedOrganizationId: string, actualOrganizationIds: readonly string[]) {
    super(`Entity resolution crossed organization scope "${expectedOrganizationId}".`);
    this.name = "EntityOrganizationScopeError";
    this.expectedOrganizationId = expectedOrganizationId;
    this.actualOrganizationIds = Object.freeze([...new Set(actualOrganizationIds)]);
  }
}
