declare const memoryItemTransitionBrand: unique symbol;

export type MemoryItemTransition = "DELETE" | "SUPERSEDE";

export type MemoryItemTransitionAuthorization = Readonly<{
  [memoryItemTransitionBrand]: true;
  transition: MemoryItemTransition;
  organizationId: string;
  targetId: string;
  actorUserId: string | null;
  sourceService: string;
}>;

const issuedAuthorizations = new WeakSet<object>();

export function authorizeMemoryItemTransition(input: {
  transition: MemoryItemTransition;
  organizationId: string;
  targetId: string;
  actorUserId?: string | null;
  sourceService: string;
}): MemoryItemTransitionAuthorization {
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
  return authorization as MemoryItemTransitionAuthorization;
}

export function assertMemoryItemTransitionAuthorization(
  authorization: MemoryItemTransitionAuthorization,
  expectedTransition: MemoryItemTransition,
): void {
  if (
    !authorization ||
    !issuedAuthorizations.has(authorization) ||
    authorization.transition !== expectedTransition
  ) {
    throw new Error(`Invalid MemoryItem ${expectedTransition} transition authorization.`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}
