import { randomUUID } from "node:crypto";

import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { auditStore } from "@/lib/action-runtime/audit";

import { resolveExecutionPermissions } from "./execution-context";

export type LegacyMutationSecurity = {
  succeed(entityId?: string, outcome?: "SUCCEEDED" | "NO_CHANGE"): void;
};

export function authorizeLegacyMutation(input: {
  authContext: AuthContext;
  actionName: string;
  requiredPermission: string;
  entityType: string;
  entityId?: string;
  idempotencyKey?: string;
  requestId?: string;
}): LegacyMutationSecurity {
  const actorId = input.authContext.user.id;
  const organizationId = input.authContext.organization.id;
  const correlationId = input.requestId ?? randomUUID();
  const permissions = resolveExecutionPermissions(input.authContext.membership.role);
  const allowed = permissions.includes(input.requiredPermission);
  const entityRef = input.entityId
    ? { entityType: input.entityType, entityId: input.entityId }
    : undefined;
  const metadata = {
    correlationId,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };

  auditStore.append({
    recordType: "POLICY_DECISION",
    actionName: input.actionName,
    actorId,
    organizationId,
    entityRef,
    outcome: allowed ? "ALLOW" : "DENY",
    reasonCode: allowed ? "PERMISSION_SATISFIED" : "PERMISSION_MISSING",
    metadata,
  });

  if (!allowed) {
    throw new AuthError("You are not allowed to perform this action.", 403);
  }

  return {
    succeed(entityId = input.entityId, outcome = "SUCCEEDED") {
      auditStore.append({
        recordType: "ACTION_RESULT",
        actionName: input.actionName,
        actorId,
        organizationId,
        entityRef: entityId ? { entityType: input.entityType, entityId } : undefined,
        outcome,
        metadata,
      });
    },
  };
}
