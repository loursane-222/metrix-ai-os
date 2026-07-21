import { MemberStatus, OrganizationRole } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateOrganizationInput,
  CreateOwnerMembershipInput,
  BriefingOrganizationResult,
  OrganizationMemberResult,
  OrganizationResult,
} from "./organization.types";

export async function listOrganizationsForDailyBriefing(): Promise<BriefingOrganizationResult[]> {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      industry: true,
      companySize: true,
      country: true,
      city: true,
      description: true,
      _count: {
        select: {
          members: {
            where: { status: MemberStatus.ACTIVE },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return organizations.map(({ _count, ...organization }) => ({
    ...organization,
    activeMemberCount: _count.members,
  }));
}

export async function createOrganizationRecord(
  input: CreateOrganizationInput,
  tx?: PrismaTransactionClient,
): Promise<OrganizationResult> {
  const client = tx ?? prisma;

  return client.organization.create({
    data: {
      name: input.name,
      industry: input.industry,
      companySize: input.companySize,
      country: input.country,
      city: input.city,
      description: input.description,
    },
  });
}

export async function findOrganizationRecordById(
  id: string,
  tx?: PrismaTransactionClient,
): Promise<OrganizationResult | null> {
  const client = tx ?? prisma;

  return client.organization.findUnique({
    where: {
      id,
    },
  });
}

export async function createOwnerMembershipRecord(
  input: CreateOwnerMembershipInput,
  tx?: PrismaTransactionClient,
): Promise<OrganizationMemberResult> {
  const client = tx ?? prisma;

  return client.organizationMember.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: OrganizationRole.OWNER,
    },
  });
}
