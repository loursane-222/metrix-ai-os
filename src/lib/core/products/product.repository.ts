import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateProductServiceInput,
  ListProductServicesInput,
  ProductServiceResult,
  UpdateProductServiceInput,
} from "./product.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createProductService(
  input: CreateProductServiceInput,
  tx?: PrismaTransactionClient,
): Promise<ProductServiceResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.productService.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      type: input.type,
      category: input.category,
      unit: input.unit,
      costCents: input.costCents,
      priceCents: input.priceCents,
      currency: input.currency ?? "TRY",
      stockBehavior: input.stockBehavior,
      attributesJson: input.attributesJson ?? undefined,
    },
  });
}

export async function getProductServiceById(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<ProductServiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.productService.findFirst({
    where: { id, organizationId },
  });
}

export async function listProductServicesForOrganization(
  input: ListProductServicesInput,
  tx?: PrismaTransactionClient,
): Promise<ProductServiceResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.productService.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 100,
  });
}

export async function updateProductService(
  input: UpdateProductServiceInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.productService.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.stockBehavior !== undefined ? { stockBehavior: input.stockBehavior } : {}),
      ...(input.attributesJson !== undefined ? { attributesJson: input.attributesJson } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function archiveProductService(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.productService.updateMany({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}
