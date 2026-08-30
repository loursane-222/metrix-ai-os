import { prisma } from "@/lib/core/shared/prisma";
import type { OrderStatus, Prisma } from "@prisma/client";
import type { CreateOrderInput, ListOrdersInput, OrderItemInput } from "./order.types";

const include = {
  customer: true,
  sourceQuote: true,
  items: { where: { removedAt: null }, include: { productService: true }, orderBy: { sortOrder: "asc" as const } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  revisions: { orderBy: { revisionNumber: "asc" as const } },
  exceptions: { orderBy: { createdAt: "asc" as const } },
  customFieldValues: true,
} as const;

export function getOrderById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.order.findFirst({ where: { id, organizationId }, include });
}

export function listOrdersForOrganization(input: ListOrdersInput) {
  return prisma.order.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

// listOrdersForOrganization caps at take (a payload-size limit) — this is
// the real total, unbounded by that cap, for callers that need to display
// "how many total" rather than "how many loaded".
export function countOrdersForOrganization(input: Pick<ListOrdersInput, "organizationId" | "status" | "customerId">) {
  return prisma.order.count({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
  });
}

export async function generateOrderNumber(organizationId: string, tx: Prisma.TransactionClient = prisma): Promise<string> {
  const count = await tx.order.count({ where: { organizationId } });
  const seq = String(count + 1).padStart(4, "0");
  return `SIP-${seq}`;
}

export function createOrder(input: CreateOrderInput & { orderNumber: string }, tx: Prisma.TransactionClient = prisma) {
  return tx.order.create({
    data: {
      organizationId: input.organizationId,
      orderNumber: input.orderNumber,
      customerId: input.customerId,
      currency: input.currency ?? "TRY",
      notes: input.notes,
      priority: input.priority ?? 0,
      deadlineAt: input.deadlineAt,
      commitmentAt: input.commitmentAt,
      paymentTermSnapshot: input.paymentTermSnapshot as Prisma.InputJsonValue | undefined,
      paymentTermReferenceDatesSnapshot: input.paymentTermReferenceDatesSnapshot as Prisma.InputJsonValue | undefined,
      status: "DRAFT",
      createdByUserId: input.createdByUserId,
    },
  });
}

export function createOrderItems(orderId: string, organizationId: string, items: OrderItemInput[], tx: Prisma.TransactionClient = prisma) {
  return tx.orderItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      orderId,
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

export function recordStatusTransition(
  orderId: string,
  organizationId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  opts: { reason?: string; performedById?: string; evidence?: Record<string, unknown> },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.orderStatusHistory.create({
    data: {
      organizationId,
      orderId,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      reason: opts.reason,
      performedById: opts.performedById,
      evidence: opts.evidence as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Bir Order satırının, bu fonksiyonun çağıranının okuduğu andan bu yana
 * başka bir eşzamanlı transaction tarafından değiştirildiğini işaretler —
 * "bulunamadı" değil, "bulundu ama artık beklenen durumunda değil" demektir.
 * transitionOrderStatus/cancelOrder bunu yakalayıp 409'a çevirir; iki
 * eşzamanlı transitionun ikisinin de reserveStockForOrder/durum geçişini
 * başarıyla tamamlamasını (çift rezervasyon) engelleyen mekanizmanın
 * parçasıdır — bkz. payment.repository.ts'deki PaymentConcurrentlyModifiedError.
 */
export class OrderConcurrentlyModifiedError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} was concurrently modified.`);
    this.name = "OrderConcurrentlyModifiedError";
  }
}

/**
 * Tenant-safe koşullu durum güncellemesi: where'e fromStatus eklenir, bu
 * yüzden iki eşzamanlı transitionOrderStatus/cancelOrder çağrısından yalnız
 * biri (Postgres'in satır kilidi sayesinde) başarılı olabilir — diğeri
 * count=0 görür. Satır hâlâ varsa (yalnız status değiştiği için eşleşmediyse)
 * bu bir eşzamanlılık çakışmasıdır (OrderConcurrentlyModifiedError), hiç
 * yoksa "bulunamadı"dır (çağıran ayırt eder).
 */
export async function updateOrderStatus(
  id: string,
  organizationId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  extra: { cancellationReason?: string } = {},
  tx: Prisma.TransactionClient = prisma,
) {
  const result = await tx.order.updateMany({
    where: { id, organizationId, status: fromStatus },
    data: { status: toStatus, ...extra },
  });

  if (result.count === 0) {
    const stillExists = await tx.order.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (stillExists) throw new OrderConcurrentlyModifiedError(id);
  }

  return result;
}
