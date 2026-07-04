import {
  ORGANIZATION_CREATED,
  ORGANIZATION_MEMBER_CREATED,
} from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";
import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import {
  createOrganizationRecord,
  createOwnerMembershipRecord,
  findOrganizationRecordById,
} from "./organization.repository";

import type {
  CreateOrganizationInput,
  CreateOrganizationWithOwnerInput,
  OrganizationResult,
  OrganizationWithOwnerResult,
} from "./organization.types";

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<OrganizationResult> {
  return createOrganizationRecord(input);
}

export async function findOrganizationById(
  id: string,
): Promise<OrganizationResult | null> {
  return findOrganizationRecordById(id);
}

export async function createOrganizationWithOwner(
  input: CreateOrganizationWithOwnerInput,
  tx?: PrismaTransactionClient,
): Promise<OrganizationWithOwnerResult> {
  if (tx) {
    return createOrganizationWithOwnerInTransaction(input, tx);
  }

  return prisma.$transaction((transactionClient) =>
    createOrganizationWithOwnerInTransaction(input, transactionClient),
  );
}

async function createOrganizationWithOwnerInTransaction(
  input: CreateOrganizationWithOwnerInput,
  tx: PrismaTransactionClient,
): Promise<OrganizationWithOwnerResult> {
  const organization = await createOrganizationRecord(
    {
      name: input.organizationName,
      industry: input.industry,
      companySize: input.companySize,
      country: input.country,
      city: input.city,
      description: input.description,
    },
    tx,
  );

  const membership = await createOwnerMembershipRecord(
    {
      organizationId: organization.id,
      userId: input.userId,
    },
    tx,
  );

  await recordEvent(
    {
      organizationId: organization.id,
      actorUserId: input.userId,
      eventType: ORGANIZATION_CREATED,
      entityType: "Organization",
      entityId: organization.id,
      payload: {
        name: organization.name,
        industry: organization.industry,
        companySize: organization.companySize,
        country: organization.country,
        city: organization.city,
      },
      source: "USER",
    },
    tx,
  );

  await recordEvent(
    {
      organizationId: organization.id,
      actorUserId: input.userId,
      eventType: ORGANIZATION_MEMBER_CREATED,
      entityType: "OrganizationMember",
      entityId: membership.id,
      payload: {
        userId: input.userId,
        role: membership.role,
        status: membership.status,
      },
      source: "USER",
    },
    tx,
  );

  return {
    organization,
    membership,
  };
}
