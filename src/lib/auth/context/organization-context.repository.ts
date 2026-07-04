import { MemberStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { CurrentOrganizationContext } from "./auth-context.types";

export async function findDefaultOrganizationContextByUserId(
  userId: string,
): Promise<CurrentOrganizationContext | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      status: MemberStatus.ACTIVE,
    },
    orderBy: {
      joinedAt: "asc",
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    return null;
  }

  return {
    organization: membership.organization,
    membership,
  };
}

export async function findOrganizationContextByUserId(
  userId: string,
  organizationId: string,
): Promise<CurrentOrganizationContext | null> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    return null;
  }

  return {
    organization: membership.organization,
    membership,
  };
}
