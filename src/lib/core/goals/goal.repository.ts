import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateSalesGoalInput,
  ListSalesGoalsInput,
  SalesGoalResult,
  UpdateSalesGoalInput,
} from "./goal.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createSalesGoal(
  input: CreateSalesGoalInput,
  tx?: PrismaTransactionClient,
): Promise<SalesGoalResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.salesGoal.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      period: input.period,
      targetRevenueCents: input.targetRevenueCents,
      targetCollectionCents: input.targetCollectionCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      scope: input.scope,
      scopeRefId: input.scopeRefId,
      goalType: input.goalType,
      currency: input.currency,
      targetValue: input.targetValue,
      actualValue: input.actualValue,
      forecastValue: input.forecastValue,
      ownerUserId: input.ownerUserId,
      kpiDefinitionId: input.kpiDefinitionId,
      provenanceJson: input.provenanceJson,
    },
  });
}

export async function getSalesGoalById(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<SalesGoalResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.salesGoal.findFirst({
    where: { id, organizationId },
  });
}

export async function listSalesGoalsForOrganization(
  input: ListSalesGoalsInput,
  tx?: PrismaTransactionClient,
): Promise<SalesGoalResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.salesGoal.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.period ? { period: input.period } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
  });
}

/**
 * Gerçek, sınırsız (take yok) toplam sayı — listSalesGoalsForOrganization
 * (take: limit ?? 50 ile sınırlı) count(company_query domain_count) için
 * kullanılamaz; "kaç hedefimiz var" gibi bir soruya 50'nin altında yanlış
 * bir sayı döndürmemek için bu ayrı fonksiyon vardır (bkz. products/
 * stock'un aynı desenindeki countXForOrganization fonksiyonları).
 */
export async function countSalesGoalsForOrganization(
  input: Pick<ListSalesGoalsInput, "organizationId" | "period" | "status">,
  tx?: PrismaTransactionClient,
): Promise<number> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.salesGoal.count({
    where: {
      organizationId: input.organizationId,
      ...(input.period ? { period: input.period } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function updateSalesGoal(
  input: UpdateSalesGoalInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.salesGoal.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.period !== undefined ? { period: input.period } : {}),
      ...(input.targetRevenueCents !== undefined ? { targetRevenueCents: input.targetRevenueCents } : {}),
      ...(input.targetCollectionCents !== undefined ? { targetCollectionCents: input.targetCollectionCents } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function archiveSalesGoal(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.salesGoal.updateMany({
    where: { id, organizationId },
    data: { status: "CANCELLED" },
  });
}
