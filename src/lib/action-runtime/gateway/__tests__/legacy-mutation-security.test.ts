import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { auditStore } from "@/lib/action-runtime/audit";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { AuthError } from "@/lib/auth/shared/auth.errors";

import { authorizeLegacyMutation } from "../legacy-mutation-security";

function authContext(role: OrganizationRole, suffix: string): AuthContext {
  return {
    user: { id: `actor-${suffix}` },
    organization: { id: `org-${suffix}` },
    membership: { role },
    session: { id: `session-${suffix}` },
  } as AuthContext;
}

describe("authorizeLegacyMutation", () => {
  it("denies a role without permission and audits trusted authority", () => {
    const auth = authContext(OrganizationRole.EMPLOYEE, "deny");

    expect(() => authorizeLegacyMutation({
      authContext: auth,
      actionName: "payment.create",
      requiredPermission: "payments.write",
      entityType: "Payment",
      requestId: "request-deny",
    })).toThrowError(AuthError);

    expect(auditStore.listByOrganization("org-deny")).toContainEqual(expect.objectContaining({
      actorId: "actor-deny",
      organizationId: "org-deny",
      actionName: "payment.create",
      outcome: "DENY",
      metadata: { correlationId: "request-deny" },
    }));
  });

  it("audits success and idempotent replay without client authority", () => {
    const auth = authContext(OrganizationRole.MANAGER, "success");
    const security = authorizeLegacyMutation({
      authContext: auth,
      actionName: "quote.create",
      requiredPermission: "quotes.write",
      entityType: "Quote",
      idempotencyKey: "idem-1",
      requestId: "request-success",
    });

    security.succeed("quote-1", "NO_CHANGE");

    expect(auditStore.listByOrganization("org-success")).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: "actor-success", outcome: "ALLOW" }),
      expect.objectContaining({
        actorId: "actor-success",
        entityRef: { entityType: "Quote", entityId: "quote-1" },
        outcome: "NO_CHANGE",
        metadata: { correlationId: "request-success", idempotencyKey: "idem-1" },
      }),
    ]));
  });
});
