import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CustomerContactResult, UpsertPrimaryContactInput } from "./customer-contact.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function findPrimaryContact(
  organizationId: string,
  customerId: string,
  tx?: PrismaTransactionClient,
): Promise<CustomerContactResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.customerContact.findFirst({
    where: { organizationId, customerId, isPrimary: true },
  });
}

export async function findPrimaryContactsForCustomers(
  organizationId: string,
  customerIds: string[],
  tx?: PrismaTransactionClient,
): Promise<CustomerContactResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  if (customerIds.length === 0) return [];

  return client.customerContact.findMany({
    where: { organizationId, customerId: { in: customerIds }, isPrimary: true },
  });
}

export async function createPrimaryContact(
  input: UpsertPrimaryContactInput,
  tx?: PrismaTransactionClient,
): Promise<CustomerContactResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.customerContact.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      personId: input.personId,
      fullName: input.fullName,
      title: input.title,
      phone: input.phone,
      email: input.email,
      isPrimary: true,
      source: input.source ?? "MANUAL",
    },
  });
}

export async function updateContact(
  id: string,
  organizationId: string,
  input: Pick<UpsertPrimaryContactInput, "fullName" | "title" | "phone" | "email" | "personId">,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.customerContact.updateMany({
    where: { id, organizationId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.personId !== undefined ? { personId: input.personId } : {}),
    },
  });
}
