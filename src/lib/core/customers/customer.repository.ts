import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateCustomerInput, CustomerResult, ListCustomersInput, UpdateCustomerInput } from "./customer.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createCustomer(
  input: CreateCustomerInput,
  tx?: PrismaTransactionClient,
): Promise<CustomerResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.customer.create({
    data: {
      organizationId: input.organizationId,
      displayName: input.displayName,
      legalName: input.legalName,
      phone: input.phone,
      email: input.email,
      balanceCents: input.balanceCents ?? BigInt(0),
      currency: input.currency ?? "TRY",
      tier: input.tier,
      healthScore: input.healthScore,
      metrixNote: input.metrixNote,
    },
  });
}

export async function findCustomerByIdentity(
  organizationId: string,
  displayName: string,
  phone: string | undefined,
  email: string | undefined,
  tx?: PrismaTransactionClient,
): Promise<CustomerResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const normalizedDisplayName = displayName.trim();

  return client.customer.findFirst({
    where: {
      organizationId,
      OR: [
        { displayName: { equals: normalizedDisplayName, mode: "insensitive" } },
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
  });
}

export async function getCustomerById(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<CustomerResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.customer.findFirst({
    where: { id, organizationId },
  });
}

export async function listCustomersForOrganization(
  input: ListCustomersInput,
  tx?: PrismaTransactionClient,
): Promise<CustomerResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.customer.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 100,
  });
}

export async function updateCustomer(
  input: UpdateCustomerInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.customer.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.balanceCents !== undefined ? { balanceCents: input.balanceCents } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(input.healthScore !== undefined ? { healthScore: input.healthScore } : {}),
      ...(input.metrixNote !== undefined ? { metrixNote: input.metrixNote } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function archiveCustomer(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.customer.updateMany({
    where: { id, organizationId },
    data: { status: "PASSIVE" },
  });
}
