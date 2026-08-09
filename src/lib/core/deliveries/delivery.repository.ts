import { prisma } from "@/lib/core/shared/prisma";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import type { CreateDeliveryInput, DeliveryItemInput, ListDeliveriesInput } from "./delivery.types";

const include = {
  customer: true,
  sourceOrder: true,
  items: {
    include: { orderItem: true, productService: true },
    orderBy: { sortOrder: "asc" as const },
  },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  exceptions: { orderBy: { createdAt: "asc" as const } },
  customFieldValues: true,
} as const;

export function getDeliveryById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.delivery.findFirst({ where: { id, organizationId }, include });
}

export function listDeliveriesForOrganization(input: ListDeliveriesInput) {
  return prisma.delivery.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.sourceOrderId ? { sourceOrderId: input.sourceOrderId } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

export async function generateDeliveryNumber(organizationId: string, tx: Prisma.TransactionClient = prisma): Promise<string> {
  const count = await tx.delivery.count({ where: { organizationId } });
  const seq = String(count + 1).padStart(4, "0");
  return `IRS-${seq}`;
}

export function createDelivery(
  input: CreateDeliveryInput & { deliveryNumber: string },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.delivery.create({
    data: {
      organizationId: input.organizationId,
      deliveryNumber: input.deliveryNumber,
      sourceOrderId: input.sourceOrderId,
      customerId: input.customerId,
      warehouse: input.warehouse,
      dispatchPoint: input.dispatchPoint,
      deliveryAddress: input.deliveryAddress,
      carrier: input.carrier,
      notes: input.notes,
      status: "DRAFT",
    },
  });
}

export function createDeliveryItems(
  deliveryId: string,
  organizationId: string,
  items: DeliveryItemInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.deliveryItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      deliveryId,
      orderItemId: item.orderItemId,
      productServiceId: item.productServiceId,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      conditionFlag: item.conditionFlag,
      sortOrder: item.sortOrder ?? index,
    })),
  });
}

export function recordDeliveryStatusTransition(
  deliveryId: string,
  organizationId: string,
  fromStatus: DeliveryStatus | null,
  toStatus: DeliveryStatus,
  opts: { reason?: string; performedById?: string; evidence?: Record<string, unknown> },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.deliveryStatusHistory.create({
    data: {
      organizationId,
      deliveryId,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      reason: opts.reason,
      performedById: opts.performedById,
      evidence: opts.evidence as Prisma.InputJsonValue | undefined,
    },
  });
}

export function updateDeliveryStatus(
  id: string,
  organizationId: string,
  toStatus: DeliveryStatus,
  extra: { cancellationReason?: string; dispatchedAt?: Date; deliveredAt?: Date } = {},
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.delivery.updateMany({
    where: { id, organizationId },
    data: { status: toStatus, ...extra },
  });
}

export function sumDeliveredQuantityForOrderItem(
  orderItemId: string,
  organizationId: string,
  excludeDeliveryId: string | null,
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.deliveryItem.findMany({
    where: {
      orderItemId,
      organizationId,
      ...(excludeDeliveryId ? { deliveryId: { not: excludeDeliveryId } } : {}),
      delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } },
    },
    select: { quantity: true },
  });
}
