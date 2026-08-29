import { prisma } from "@/lib/core/shared/prisma";
import { findOrganizationContextByUserId } from "./organization-context.repository";
import type { AuthContext } from "./auth-context.types";

/**
 * Reconstructs a real AuthContext for a specific organization member WITHOUT
 * a live session/cookie — used only by rep-requests' promotion step, which
 * must execute a Business Candidate's action-runtime call under the
 * ORIGINAL requester's identity (role/permissions), not the approving
 * manager's, even though the manager's own request is what triggers it.
 *
 * Safe because ExecutionContext.sessionRef/issuedAt/expiresAt (derived from
 * authContext.session) are copied through as audit metadata only — nothing
 * in the execution pipeline re-validates them against a live session.
 */
export async function buildAuthContextForOrganizationMember(userId: string, organizationId: string): Promise<AuthContext> {
  const [user, organizationContext, session] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    findOrganizationContextByUserId(userId, organizationId),
    prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!organizationContext) throw new Error("ORGANIZATION_MEMBER_NOT_FOUND");
  if (!session) throw new Error("ORGANIZATION_MEMBER_HAS_NO_SESSION");
  return { user, organization: organizationContext.organization, membership: organizationContext.membership, session };
}
