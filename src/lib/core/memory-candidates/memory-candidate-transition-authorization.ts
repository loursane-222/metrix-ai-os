declare const memoryCandidateTransitionBrand: unique symbol;

export type MemoryCandidateTransition = "APPROVE" | "REJECT" | "DISMISS" | "EXPIRE";

export type MemoryCandidateTransitionAuthorization = Readonly<{
  [memoryCandidateTransitionBrand]: true;
  transition: MemoryCandidateTransition;
  organizationId: string;
  targetId: string;
  actorUserId: string | null;
  sourceService: string;
}>;

const issuedAuthorizations = new WeakSet<object>();

export function authorizeMemoryCandidateTransition(input: {
  transition: MemoryCandidateTransition;
  organizationId: string;
  targetId: string;
  actorUserId?: string | null;
  sourceService: string;
}): MemoryCandidateTransitionAuthorization {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.targetId, "targetId");
  assertNonEmpty(input.sourceService, "sourceService");
  const authorization = Object.freeze({
    transition: input.transition,
    organizationId: input.organizationId,
    targetId: input.targetId,
    actorUserId: input.actorUserId ?? null,
    sourceService: input.sourceService,
  });
  issuedAuthorizations.add(authorization);
  return authorization as MemoryCandidateTransitionAuthorization;
}

export function assertMemoryCandidateTransitionAuthorization(
  authorization: MemoryCandidateTransitionAuthorization,
  expectedTransition: MemoryCandidateTransition,
): void {
  if (
    !authorization ||
    !issuedAuthorizations.has(authorization) ||
    authorization.transition !== expectedTransition
  ) {
    throw new Error(`Invalid MemoryCandidate ${expectedTransition} transition authorization.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}
