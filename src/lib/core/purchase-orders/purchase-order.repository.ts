import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import type { CreatePurchaseOrderInput, ListPurchaseOrdersInput, PurchaseOrderItemInput } from "./purchase-order.types";

const include = {
  supplier: true,
  items: { include: { productService: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

export function getPurchaseOrderById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.purchaseOrder.findFirst({ where: { id, organizationId }, include });
}

export function listPurchaseOrdersForOrganization(input: ListPurchaseOrdersInput) {
  return prisma.purchaseOrder.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

export function countPurchaseOrdersForOrganization(input: Pick<ListPurchaseOrdersInput, "organizationId" | "status" | "supplierId">) {
  return prisma.purchaseOrder.count({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    },
  });
}

export async function generatePurchaseOrderNumber(organizationId: string, tx: Prisma.TransactionClient = prisma): Promise<string> {
  const count = await tx.purchaseOrder.count({ where: { organizationId } });
  const seq = String(count + 1).padStart(4, "0");
  return `PO-${seq}`;
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput & { poNumber: string }, tx: Prisma.TransactionClient = prisma) {
  return tx.purchaseOrder.create({
    data: {
      organizationId: input.organizationId,
      poNumber: input.poNumber,
      supplierId: input.supplierId,
      currency: input.currency ?? "TRY",
      notes: input.notes,
      expectedDeliveryDate: input.expectedDeliveryDate,
      status: "DRAFT",
      createdByUserId: input.createdByUserId,
    },
  });
}

export function createPurchaseOrderItems(purchaseOrderId: string, organizationId: string, items: PurchaseOrderItemInput[], tx: Prisma.TransactionClient = prisma) {
  return tx.purchaseOrderItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      purchaseOrderId,
      productServiceId: item.productServiceId,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountBasisPoints: item.discountBasisPoints ?? 0,
      vatRateBasisPoints: item.vatRateBasisPoints ?? 0,
      lineTotalCents: item.lineTotalCents,
      sortOrder: item.sortOrder ?? index,
    })),
  });
}

/**
 * order.repository.ts::updateOrderStatus ile aynı CAS deseni: where'e
 * fromStatus eklenir, iki eşzamanlı transitionPurchaseOrderStatus/
 * cancelPurchaseOrder çağrısından yalnız biri başarılı olabilir.
 */
export class PurchaseOrderConcurrentlyModifiedError extends Error {
  constructor(purchaseOrderId: string) {
    super(`PurchaseOrder ${purchaseOrderId} was concurrently modified.`);
    this.name = "PurchaseOrderConcurrentlyModifiedError";
  }
}

export async function updatePurchaseOrderStatus(
  id: string,
  organizationId: string,
  fromStatus: PurchaseOrderStatus,
  toStatus: PurchaseOrderStatus,
  extra: { cancellationReason?: string } = {},
  tx: Prisma.TransactionClient = prisma,
) {
  const result = await tx.purchaseOrder.updateMany({
    where: { id, organizationId, status: fromStatus },
    data: { status: toStatus, ...extra },
  });

  if (result.count === 0) {
    const stillExists = await tx.purchaseOrder.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (stillExists) throw new PurchaseOrderConcurrentlyModifiedError(id);
  }

  return result;
}
