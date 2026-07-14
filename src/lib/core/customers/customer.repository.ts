import { prisma } from "@/lib/core/shared/prisma";

import type { Prisma } from "@prisma/client";
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
      cariKodu: input.cariKodu,
      taxNumber: input.taxNumber,
      taxOffice: input.taxOffice,
      mersisNo: input.mersisNo,
      tradeRegistryNo: input.tradeRegistryNo,
      billingAddress: input.billingAddress as Prisma.InputJsonValue | undefined,
      shippingAddress: input.shippingAddress as Prisma.InputJsonValue | undefined,
      eInvoiceEnabled: input.eInvoiceEnabled ?? false,
      eArchiveEnabled: input.eArchiveEnabled ?? false,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
    },
  });
}

export async function findCustomerByIdentity(
  organizationId: string,
  displayName: string,
  phone: string | undefined,
  email: string | undefined,
  tx?: PrismaTransactionClient,
  identifiers?: { cariKodu?: string; taxNumber?: string },
): Promise<CustomerResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const normalizedDisplayName = displayName.trim();
  const cariKodu = identifiers?.cariKodu?.trim();
  const taxNumber = identifiers?.taxNumber?.trim();

  return client.customer.findFirst({
    where: {
      organizationId,
      OR: [
        { displayName: { equals: normalizedDisplayName, mode: "insensitive" } },
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(cariKodu ? [{ cariKodu }] : []),
        ...(taxNumber ? [{ taxNumber }] : []),
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

  const data: Prisma.CustomerUncheckedUpdateManyInput = {
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
    ...(input.cariKodu !== undefined ? { cariKodu: input.cariKodu } : {}),
    ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
    ...(input.taxOffice !== undefined ? { taxOffice: input.taxOffice } : {}),
    ...(input.mersisNo !== undefined ? { mersisNo: input.mersisNo } : {}),
    ...(input.tradeRegistryNo !== undefined ? { tradeRegistryNo: input.tradeRegistryNo } : {}),
    ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress as Prisma.InputJsonValue } : {}),
    ...(input.shippingAddress !== undefined ? { shippingAddress: input.shippingAddress as Prisma.InputJsonValue } : {}),
    ...(input.eInvoiceEnabled !== undefined ? { eInvoiceEnabled: input.eInvoiceEnabled } : {}),
    ...(input.eArchiveEnabled !== undefined ? { eArchiveEnabled: input.eArchiveEnabled } : {}),
    ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
  };

  await client.customer.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data,
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
