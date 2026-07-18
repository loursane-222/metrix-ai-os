import type { ExecutiveDecisionRecordStatus } from "@prisma/client";

declare const executiveDecisionTransitionBrand: unique symbol;

export type ExecutiveDecisionRecordTransition = "COMMIT" | "REJECT" | "CLOSE";

export type ExecutiveDecisionRecordTransitionAuthorization = Readonly<{
  [executiveDecisionTransitionBrand]: true;
  transition: ExecutiveDecisionRecordTransition;
  organizationId: string;
  targetId: string;
  actorUserId: string | null;
  fromStatus: ExecutiveDecisionRecordStatus;
  toStatus: ExecutiveDecisionRecordStatus;
  sourceService: string;
}>;

const issuedAuthorizations = new WeakSet<object>();

export function authorizeExecutiveDecisionRecordTransition(input: {
  transition: ExecutiveDecisionRecordTransition;
  organizationId: string;
  targetId: string;
  actorUserId?: string | null;
  fromStatus: ExecutiveDecisionRecordStatus;
  sourceService: string;
}): ExecutiveDecisionRecordTransitionAuthorization {
  const toStatus = resolveTargetStatus(input.transition);
  if (!isAllowedTransition(input.fromStatus, toStatus)) {
    throw new Error(`Invalid ExecutiveDecisionRecord transition: ${input.fromStatus} -> ${toStatus}.`);
  }
  const authorization = Object.freeze({ ...input, actorUserId: input.actorUserId ?? null, toStatus });
  issuedAuthorizations.add(authorization);
  return authorization as ExecutiveDecisionRecordTransitionAuthorization;
}

export function assertExecutiveDecisionRecordTransitionAuthorization(
  authorization: ExecutiveDecisionRecordTransitionAuthorization,
  expectedTransition: ExecutiveDecisionRecordTransition,
): void {
  if (
    !authorization ||
    !issuedAuthorizations.has(authorization) ||
    authorization.transition !== expectedTransition ||
    !isAllowedTransition(authorization.fromStatus, authorization.toStatus)
  ) {
    throw new Error(`Invalid ExecutiveDecisionRecord ${expectedTransition} transition authorization.`);
  }
}

function resolveTargetStatus(
  transition: ExecutiveDecisionRecordTransition,
): ExecutiveDecisionRecordStatus {
  if (transition === "COMMIT") return "COMMITTED";
  if (transition === "REJECT") return "REJECTED";
  return "CLOSED";
}

function isAllowedTransition(
  from: ExecutiveDecisionRecordStatus,
  to: ExecutiveDecisionRecordStatus,
): boolean {
  return (
    (from === "PROPOSED" && (to === "COMMITTED" || to === "REJECTED")) ||
    (from === "COMMITTED" && to === "CLOSED")
  );
}
