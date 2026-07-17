import { OrganizationRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildExecutionContext, resolveExecutionPermissions } from "../execution-context";

function buildAuthContext(overrides: Partial<{ role: OrganizationRole }> = {}): AuthContext {
  return {
    user: { id: "user_1" } as AuthContext["user"],
    organization: { id: "org_1" } as AuthContext["organization"],
    membership: { role: overrides.role ?? OrganizationRole.EMPLOYEE } as AuthContext["membership"],
    session: {
      id: "session_1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    } as AuthContext["session"],
  };
}

describe("resolveExecutionPermissions", () => {
  it("grants customers.write to every OrganizationRole", () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(resolveExecutionPermissions(role)).toContain("customers.write");
    }
  });

  it("grants customers.archive only to OWNER and EXECUTIVE", () => {
    expect(resolveExecutionPermissions(OrganizationRole.OWNER)).toContain("customers.archive");
    expect(resolveExecutionPermissions(OrganizationRole.EXECUTIVE)).toContain("customers.archive");
    expect(resolveExecutionPermissions(OrganizationRole.MANAGER)).not.toContain("customers.archive");
    expect(resolveExecutionPermissions(OrganizationRole.TEAM_LEAD)).not.toContain("customers.archive");
    expect(resolveExecutionPermissions(OrganizationRole.EMPLOYEE)).not.toContain("customers.archive");
  });

  it("returns no permissions for an unknown/unrecognized role", () => {
    expect(resolveExecutionPermissions("SOMETHING_NEW")).toEqual([]);
  });
});

describe("buildExecutionContext", () => {
  it("derives actorId/organizationId/sessionRef/issuedAt/expiresAt from the trusted AuthContext", () => {
    const authContext = buildAuthContext();
    const context = buildExecutionContext(authContext);

    expect(context.actorId).toBe("user_1");
    expect(context.organizationId).toBe("org_1");
    expect(context.sessionRef).toBe("session_1");
    expect(context.issuedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(context.expiresAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("carries the role only as metadata and derives permissions from it via the same resolver", () => {
    const authContext = buildAuthContext({ role: OrganizationRole.MANAGER });
    const context = buildExecutionContext(authContext);

    expect(context.role).toBe("MANAGER");
    expect(context.permissions).toEqual(resolveExecutionPermissions(OrganizationRole.MANAGER));
  });

  it("has no concept of client-supplied actor/organization data — every field traces to AuthContext", () => {
    const authContext = buildAuthContext({ role: OrganizationRole.OWNER });
    const context = buildExecutionContext(authContext);

    expect(Object.keys(context).sort()).toEqual(
      ["actorId", "organizationId", "role", "permissions", "sessionRef", "issuedAt", "expiresAt"].sort(),
    );
  });
});
