import { OrganizationRole } from "@prisma/client";

import { AuthError } from "@/lib/auth/shared/auth.errors";

import type { AuthContext } from "@/lib/auth/context/auth-context.types";

export function assertCanReviewMemoryCandidates(context: AuthContext): void {
  if (
    context.membership.role !== OrganizationRole.OWNER &&
    context.membership.role !== OrganizationRole.EXECUTIVE
  ) {
    throw new AuthError("You are not allowed to review memory candidates.", 403);
  }
}
