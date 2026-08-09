import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import type { OrderExceptionCategory, OrderStatus, Prisma } from "@prisma/client";
import type { OrderItemInput, OrderRevisionChange } from "./order.types";

export const INSUFFICIENT_CANONICAL_DATA = "INSUFFICIENT_CANONICAL_DATA" as const;
const DAY_MS = 86_400_000;
const SHIPPED_DELIVERY_STATUSES = ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] as const;

type ReservedRow = { orderItemId: string; reserved: number };
type ShortfallRow = { orderItemId: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reservedRows(value: unknown): ReservedRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(record).flatMap((row) => typeof row.orderItemId === "string" && typeof row.reserved === "number"
    ? [{ orderItemId: row.orderItemId, reserved: row.reserved }]
    : []);
}

function shortfallRows(value: unknown): ShortfallRow[] {
  if (!record(value) || !Array.isArray(value.stockShortfall)) return [];
  return value.stockShortfall.filter(record).flatMap((row) => typeof row.orderItemId === "string" ? [{ orderItemId: row.orderItemId }] : []);
}

function stageLabel(status: OrderStatus): string {
  return ({ DRAFT: "Taslak hazırlanıyor", PENDING_APPROVAL: "Onay bekliyor", APPROVED: "Onaylandı, rezervasyon planı hazır", PLANNED: "Operasyon planlandı", IN_PRODUCTION: "Üretimde", ON_HOLD: "Beklemede", READY: "Sevke hazır", PARTIALLY_SHIPPED: "Kısmen sevk edildi", SHIPPED: "Sevk edildi", COMPLETED: "Tamamlandı", CANCELLED: "İptal edildi" } satisfies Record<OrderStatus, string>)[status];
}

function orderOrThrow(orderId: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      items: { where: { removedAt: null }, orderBy: { sortOrder: "asc" } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
      revisions: { orderBy: { revisionNumber: "asc" } },
    },
  }).then((order) => {
    if (!order) throw new ApiValidationError("Order not found.");
    return order;
  });
}

export async function computeOrderExecutionStage(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const order = await orderOrThrow(orderId, organizationId, outerTx ?? prisma);
  return { status: order.status, stageLabel: stageLabel(order.status), lastTransitionAt: order.statusHistory[0]?.createdAt ?? order.createdAt };
}

export async function computeOrderFulfillmentStrategy(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const order = await orderOrThrow(orderId, organizationId, outerTx ?? prisma);
  const reservations = reservedRows(order.reservedInventory);
  const shortfalls = new Set(shortfallRows(order.riskSignals).map((row) => row.orderItemId));
  const items = order.items.map((item) => {
    const requested = Number(item.quantity);
    const reserved = reservations.filter((row) => row.orderItemId === item.id).reduce((sum, row) => sum + row.reserved, 0);
    const label = reserved >= requested && requested > 0
      ? "Stoktan tamamen karşılanabilir"
      : reserved > 0
        ? "Kısmi stok mevcut"
        : shortfalls.has(item.id)
          ? "Tedarik/üretim gerekiyor"
          : "Rezervasyon verisi bekleniyor";
    return { orderItemId: item.id, name: item.name, requested, reserved, remaining: Math.max(0, requested - reserved), label };
  });
  const full = items.filter((item) => item.label === "Stoktan tamamen karşılanabilir").length;
  const partial = items.filter((item) => item.label === "Kısmi stok mevcut").length;
  const required = items.filter((item) => item.label === "Tedarik/üretim gerekiyor").length;
  const waiting = items.length - full - partial - required;
  const parts = [`${items.length} kalemin ${full} tanesi stoktan tam karşılanıyor`];
  if (partial) parts.push(`${partial} kalem kısmi`);
  if (required) parts.push(`${required} kalem için tedarik/üretim gerekiyor`);
  if (waiting) parts.push(`${waiting} kalem rezervasyon bekliyor`);
  return { status: waiting === items.length ? INSUFFICIENT_CANONICAL_DATA : "AVAILABLE", items, fulfillmentSummary: parts.join(", ") + "." };
}

export async function computeOrderReservationStatus(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const order = await orderOrThrow(orderId, organizationId, outerTx ?? prisma);
  if (["SHIPPED", "COMPLETED"].includes(order.status)) return { reservationStatus: "Rezervasyon çözüldü" };
  if (!Array.isArray(order.reservedInventory)) return { reservationStatus: "Rezervasyon bekliyor" };
  const reservations = reservedRows(order.reservedInventory);
  const reservedByItem = new Map<string, number>();
  for (const row of reservations) reservedByItem.set(row.orderItemId, (reservedByItem.get(row.orderItemId) ?? 0) + row.reserved);
  const complete = order.items.length > 0 && order.items.every((item) => (reservedByItem.get(item.id) ?? 0) >= Number(item.quantity));
  return { reservationStatus: complete ? "Tam rezervasyon" : "Kısmi rezervasyon" };
}

export async function computeOrderPriority(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const order = await orderOrThrow(orderId, organizationId, outerTx ?? prisma);
  const factors: Array<{ key: string; score: number; maxScore: number; explanation: string }> = [];
  if (order.deadlineAt) {
    const days = Math.ceil((order.deadlineAt.getTime() - Date.now()) / DAY_MS);
    const score = days < 0 ? 40 : days <= 2 ? 35 : days <= 7 ? 25 : days <= 14 ? 15 : 5;
    factors.push({ key: "deadline", score, maxScore: 40, explanation: days < 0 ? `Teslim tarihi ${Math.abs(days)} gün geçti` : `Teslim tarihine ${days} gün kaldı` });
  }
  const totalCents = order.items.reduce((sum, item) => sum + item.lineTotalCents, BigInt(0));
  if (order.items.length) {
    const score = totalCents >= BigInt(100_000_000) ? 20 : totalCents >= BigInt(25_000_000) ? 14 : totalCents >= BigInt(5_000_000) ? 8 : 3;
    factors.push({ key: "orderAmount", score, maxScore: 20, explanation: `Sipariş tutarı ${(Number(totalCents) / 100).toLocaleString("tr-TR")} ${order.currency}` });
  }
  const hasReservationEvidence = Array.isArray(order.reservedInventory) || record(order.riskSignals);
  const hasShortfall = shortfallRows(order.riskSignals).length > 0;
  if (hasReservationEvidence) {
    factors.push({ key: "stockStatus", score: hasShortfall ? 20 : 0, maxScore: 20, explanation: hasShortfall ? "Stok açığı var" : "Kanonik stok açığı yok" });
    factors.push({ key: "delayRisk", score: hasShortfall ? 20 : 0, maxScore: 20, explanation: hasShortfall ? "Stok açığı gecikme riski oluşturuyor" : "Stok kaynaklı gecikme sinyali yok" });
  }
  const max = factors.reduce((sum, factor) => sum + factor.maxScore, 0);
  const raw = factors.reduce((sum, factor) => sum + factor.score, 0);
  const score = max ? Math.round((raw / max) * 100) : null;
  const priorityLabel = score === null ? "Belirsiz" : score >= 80 ? "Kritik" : score >= 65 ? "Acil" : score >= 45 ? "Yüksek" : score >= 20 ? "Normal" : "Düşük";
  const omittedFactors = ["Üretim yükü", "Sözleşmesel yükümlülük", "Müşteri önemi", ...(!order.deadlineAt ? ["Teslim tarihi"] : []), ...(!hasReservationEvidence ? ["Stok durumu", "Gecikme riski"] : [])];
  return { score, priorityLabel, confidence: factors.length >= 4 ? "Yüksek" : factors.length >= 2 ? "Düşük" : "Yetersiz", factors, omittedFactors, priorityExplanation: factors.map((factor) => factor.explanation).join(" · ") || INSUFFICIENT_CANONICAL_DATA };
}

export async function computeDeliveryProgress(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const tx = outerTx ?? prisma;
  const order = await orderOrThrow(orderId, organizationId, tx);
  const deliveries = await tx.delivery.findMany({ where: { organizationId, sourceOrderId: orderId, status: { in: [...SHIPPED_DELIVERY_STATUSES] } }, include: { items: true } });
  const shippedByItem = new Map<string, number>();
  for (const delivery of deliveries) for (const item of delivery.items) shippedByItem.set(item.orderItemId, (shippedByItem.get(item.orderItemId) ?? 0) + Number(item.quantity));
  const items = order.items.map((item) => ({ orderItemId: item.id, name: item.name, ordered: Number(item.quantity), shipped: shippedByItem.get(item.id) ?? 0, remaining: Math.max(0, Number(item.quantity) - (shippedByItem.get(item.id) ?? 0)) }));
  const ordered = items.reduce((sum, item) => sum + item.ordered, 0);
  const shipped = items.reduce((sum, item) => sum + item.shipped, 0);
  return { shipmentCount: deliveries.length, items, deliveryProgressSummary: `${ordered} adetin ${shipped} adedi ${deliveries.length} sevkiyatla sevk edildi, ${Math.max(0, ordered - shipped)} kaldı.` };
}

export async function computeDeliveryCommitmentRate(organizationId: string, windowDays = 90) {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const orders = await prisma.order.findMany({ where: { organizationId, commitmentAt: { not: null }, status: { in: ["SHIPPED", "COMPLETED"] }, updatedAt: { gte: since } }, include: { deliveries: { where: { OR: [{ deliveredAt: { not: null } }, { dispatchedAt: { not: null } }] }, select: { deliveredAt: true, dispatchedAt: true } } } });
  const measured = orders.flatMap((order) => {
    const dates = order.deliveries.map((delivery) => delivery.deliveredAt ?? delivery.dispatchedAt).filter((date): date is Date => date !== null);
    if (!dates.length || !order.commitmentAt) return [];
    return [{ commitmentAt: order.commitmentAt, completedAt: new Date(Math.max(...dates.map((date) => date.getTime()))) }];
  });
  if (!measured.length) return { rate: null, onTimeDeliveryRate: null, status: INSUFFICIENT_CANONICAL_DATA, measuredOrders: 0 };
  const onTime = measured.filter((row) => row.completedAt <= row.commitmentAt).length;
  const rate = Math.round((onTime / measured.length) * 100);
  return { rate, onTimeDeliveryRate: `%${rate}`, status: "AVAILABLE", measuredOrders: measured.length };
}

function snapshot(order: Awaited<ReturnType<typeof orderOrThrow>>): Prisma.InputJsonValue {
  return { deadlineAt: order.deadlineAt?.toISOString() ?? null, items: order.items.map((item) => ({ id: item.id, productServiceId: item.productServiceId, name: item.name, unit: item.unit, quantity: item.quantity.toString(), unitPriceCents: item.unitPriceCents.toString(), lineTotalCents: item.lineTotalCents.toString(), sortOrder: item.sortOrder })) };
}

export async function recordOrderRevision(orderId: string, organizationId: string, changes: OrderRevisionChange, reason?: string, performedById?: string, outerTx?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const before = await orderOrThrow(orderId, organizationId, tx);
    const beforeSnapshot = snapshot(before);
    if (changes.changeType === "QUANTITY_CHANGED") {
      const item = before.items.find((candidate) => candidate.id === changes.orderItemId);
      if (!item || changes.quantity <= 0) throw new ApiValidationError("Valid order item and positive quantity are required.");
      await tx.orderItem.updateMany({ where: { id: item.id, orderId, organizationId, removedAt: null }, data: { quantity: changes.quantity, lineTotalCents: BigInt(Math.round(Number(item.unitPriceCents) * changes.quantity)) } });
    } else if (changes.changeType === "DEADLINE_CHANGED") {
      await tx.order.updateMany({ where: { id: orderId, organizationId }, data: { deadlineAt: changes.deadlineAt } });
    } else if (changes.changeType === "ITEM_ADDED") {
      const item: OrderItemInput = changes.item;
      await tx.orderItem.create({ data: { organizationId, orderId, productServiceId: item.productServiceId, name: item.name, unit: item.unit, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents, sortOrder: item.sortOrder ?? before.items.length } });
    } else {
      const updated = await tx.orderItem.updateMany({ where: { id: changes.orderItemId, orderId, organizationId, removedAt: null }, data: { removedAt: new Date() } });
      if (!updated.count) throw new ApiValidationError("Order item not found.");
    }
    const after = await orderOrThrow(orderId, organizationId, tx);
    const revision = await tx.orderRevision.create({ data: { organizationId, orderId, revisionNumber: before.revisions.length + 1, changeType: changes.changeType, beforeSnapshot, afterSnapshot: snapshot(after), reason, performedById } });
    await refreshOrderIntelligence(orderId, organizationId, tx);
    return revision;
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function recordOrderException(orderId: string, organizationId: string, category: OrderExceptionCategory, note?: string, performedById?: string, outerTx?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    await orderOrThrow(orderId, organizationId, tx);
    return tx.orderException.create({ data: { organizationId, orderId, category, note, performedById } });
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function refreshOrderIntelligence(orderId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const tx = outerTx ?? prisma;
  const [execution, fulfillment, reservation, priority, delivery] = await Promise.all([
    computeOrderExecutionStage(orderId, organizationId, tx),
    computeOrderFulfillmentStrategy(orderId, organizationId, tx),
    computeOrderReservationStatus(orderId, organizationId, tx),
    computeOrderPriority(orderId, organizationId, tx),
    computeDeliveryProgress(orderId, organizationId, tx),
  ]);
  const executiveSummary = { execution, fulfillment, reservation, priority, delivery, computedFactors: priority.factors.map((factor) => factor.key), omittedFactors: priority.omittedFactors } as Prisma.InputJsonValue;
  await tx.order.updateMany({ where: { id: orderId, organizationId }, data: { priority: priority.score ?? 0, executiveSummary } });
  return { execution, fulfillment, reservation, priority, delivery };
}
