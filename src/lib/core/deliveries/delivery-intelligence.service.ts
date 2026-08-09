import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import type { DeliveryExceptionCategory, DeliveryItemCondition, Prisma } from "@prisma/client";

export const INSUFFICIENT_CANONICAL_DATA = "INSUFFICIENT_CANONICAL_DATA" as const;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const POST_DISPATCH_STATUSES = ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED"] as const;

export type ProofOfDeliveryInput = {
  confirmationCode?: string;
  receiverName?: string;
  signatureCaptured?: boolean;
  note?: string;
};

type MeasuredDelivery = {
  id: string;
  carrier: string | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  commitmentAt: Date | null;
  conditionFlags: Array<DeliveryItemCondition | null>;
  failedBeforeDelivery: boolean;
  delivered: boolean;
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(value: number | null): string | null {
  return value === null ? null : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function conditionLabel(flag: DeliveryItemCondition | null): string {
  if (flag === null) return "Durum bildirilmedi";
  return ({ OK: "Eksiksiz", SHORT: "Eksik", DAMAGED: "Hasarlı", WRONG_ITEM: "Yanlış ürün", MIXED: "Karışık durum" } satisfies Record<DeliveryItemCondition, string>)[flag];
}

async function deliveryOrThrow(deliveryId: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  const delivery = await tx.delivery.findFirst({
    where: { id: deliveryId, organizationId },
    include: {
      sourceOrder: { include: { items: { where: { removedAt: null } } } },
      items: { include: { orderItem: true }, orderBy: { sortOrder: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      exceptions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!delivery) throw new ApiValidationError("Delivery not found.");
  return delivery;
}

export async function computeShipmentIntegrity(deliveryId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const delivery = await deliveryOrThrow(deliveryId, organizationId, outerTx ?? prisma);
  const orderQuantity = delivery.sourceOrder.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const deliveryQuantity = delivery.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const coverageRate = orderQuantity > 0 ? round((deliveryQuantity / orderQuantity) * 100) : null;
  const items = delivery.items.map((item) => ({
    deliveryItemId: item.id,
    orderItemId: item.orderItemId,
    name: item.name,
    deliveredQuantity: Number(item.quantity),
    orderQuantity: Number(item.orderItem.quantity),
    conditionFlag: item.conditionFlag,
    conditionLabel: conditionLabel(item.conditionFlag),
  }));
  const reported = items.filter((item) => item.conditionFlag !== null);
  const problematic = reported.filter((item) => item.conditionFlag !== "OK");
  const scopeLabel = coverageRate === null
    ? INSUFFICIENT_CANONICAL_DATA
    : coverageRate >= 100
      ? "Bu sevkiyat siparişin tamamını temsil ediyor"
      : `Bu sevkiyat siparişin %${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(coverageRate)} oranındaki kısmını temsil ediyor`;
  const conditionSummary = reported.length
    ? problematic.length ? `${reported.length} bildirilen kalemin ${problematic.length} tanesinde eksik/hasarlı/yanlış/karışık durum var` : `${reported.length} bildirilen kalemin tamamı eksiksiz`
    : "Kalem durumu bildirilmedi";
  return {
    status: orderQuantity > 0 ? "AVAILABLE" : INSUFFICIENT_CANONICAL_DATA,
    coverageRate,
    items,
    integritySummary: `${scopeLabel}. ${conditionSummary}.`,
  };
}

async function measuredDeliveries(organizationId: string, windowDays: number, tx: Prisma.TransactionClient = prisma): Promise<MeasuredDelivery[]> {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const deliveries = await tx.delivery.findMany({
    where: { organizationId, status: { in: [...POST_DISPATCH_STATUSES] }, dispatchedAt: { gte: since } },
    include: {
      sourceOrder: { select: { commitmentAt: true } },
      items: { select: { conditionFlag: true } },
      statusHistory: { select: { toStatus: true } },
    },
  });
  return deliveries.map((delivery) => ({
    id: delivery.id,
    carrier: delivery.carrier?.trim() || null,
    dispatchedAt: delivery.dispatchedAt,
    deliveredAt: delivery.deliveredAt,
    commitmentAt: delivery.sourceOrder.commitmentAt,
    conditionFlags: delivery.items.map((item) => item.conditionFlag),
    failedBeforeDelivery: delivery.statusHistory.some((history) => history.toStatus === "FAILED_DELIVERY"),
    delivered: delivery.status === "DELIVERED" || delivery.status === "COMPLETED" || delivery.deliveredAt !== null,
  }));
}

function performanceMetrics(rows: MeasuredDelivery[]) {
  const commitmentMeasured = rows.filter((row) => row.commitmentAt && (row.deliveredAt || row.dispatchedAt));
  const onTimeCount = commitmentMeasured.filter((row) => (row.deliveredAt ?? row.dispatchedAt)! <= row.commitmentAt!).length;
  const onTimeRate = commitmentMeasured.length ? round((onTimeCount / commitmentMeasured.length) * 100) : null;
  const durations = rows.flatMap((row) => row.dispatchedAt && row.deliveredAt ? [(row.deliveredAt.getTime() - row.dispatchedAt.getTime()) / HOUR_MS] : []);
  const averageDeliveryHours = durations.length ? round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null;
  const conditionMeasured = rows.filter((row) => row.conditionFlags.some((flag) => flag !== null));
  const damagedOrShort = conditionMeasured.filter((row) => row.conditionFlags.some((flag) => flag !== null && flag !== "OK"));
  const damageRate = conditionMeasured.length ? round((damagedOrShort.length / conditionMeasured.length) * 100) : null;
  return { measuredDeliveries: rows.length, commitmentMeasured: commitmentMeasured.length, onTimeRate, onTimeDeliveryRate: percent(onTimeRate), averageDeliveryHours, averageDeliveryDays: averageDeliveryHours === null ? null : round(averageDeliveryHours / 24), conditionMeasured: conditionMeasured.length, damageRateValue: damageRate, damageRate: percent(damageRate) };
}

export async function computeCarrierPerformance(organizationId: string, windowDays = 90, outerTx?: Prisma.TransactionClient) {
  const deliveries = (await measuredDeliveries(organizationId, windowDays, outerTx ?? prisma)).filter((delivery) => delivery.carrier !== null);
  const grouped = new Map<string, MeasuredDelivery[]>();
  for (const delivery of deliveries) grouped.set(delivery.carrier!, [...(grouped.get(delivery.carrier!) ?? []), delivery]);
  const carriers = [...grouped.entries()].map(([carrier, rows]) => ({ carrier, ...performanceMetrics(rows) })).sort((left, right) => {
    if (left.onTimeRate === null && right.onTimeRate === null) return left.carrier.localeCompare(right.carrier, "tr");
    if (left.onTimeRate === null) return 1;
    if (right.onTimeRate === null) return -1;
    return right.onTimeRate - left.onTimeRate || (left.damageRateValue ?? 101) - (right.damageRateValue ?? 101);
  });
  return { status: carriers.length ? "AVAILABLE" : INSUFFICIENT_CANONICAL_DATA, windowDays, carriers, carrierPerformanceSummary: carriers.length ? carriers.map((carrier) => `${carrier.carrier}: zamanında ${carrier.onTimeDeliveryRate ?? "ölçülemedi"}, hasar/eksik ${carrier.damageRate ?? "ölçülemedi"}, ortalama ${carrier.averageDeliveryHours === null ? "ölçülemedi" : `${carrier.averageDeliveryHours} saat`}`).join(" · ") : INSUFFICIENT_CANONICAL_DATA };
}

export async function computeDeliveryPerformance(organizationId: string, windowDays = 90, outerTx?: Prisma.TransactionClient) {
  const rows = await measuredDeliveries(organizationId, windowDays, outerTx ?? prisma);
  const metrics = performanceMetrics(rows);
  const completed = rows.filter((row) => row.delivered);
  const firstAttemptSuccessRateValue = completed.length ? round((completed.filter((row) => !row.failedBeforeDelivery).length / completed.length) * 100) : null;
  return {
    status: rows.length ? "AVAILABLE" : INSUFFICIENT_CANONICAL_DATA,
    windowDays,
    ...metrics,
    firstAttemptMeasured: completed.length,
    firstAttemptSuccessRateValue,
    firstAttemptSuccessRate: percent(firstAttemptSuccessRateValue),
  };
}

export async function recordProofOfDelivery(deliveryId: string, organizationId: string, proof: ProofOfDeliveryInput, outerTx?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    await deliveryOrThrow(deliveryId, organizationId, tx);
    const deliveryProof = {
      confirmationCode: proof.confirmationCode?.trim() || null,
      signatureCaptured: proof.signatureCaptured ?? null,
      note: proof.note?.trim() || null,
      recordedAt: new Date().toISOString(),
    };
    await tx.delivery.updateMany({ where: { id: deliveryId, organizationId }, data: { receiverName: proof.receiverName?.trim() || undefined, deliveryProof: json(deliveryProof) } });
    await refreshDeliveryIntelligence(deliveryId, organizationId, tx);
    return deliveryOrThrow(deliveryId, organizationId, tx);
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function recordDeliveryException(deliveryId: string, organizationId: string, category: DeliveryExceptionCategory, note?: string, performedById?: string, outerTx?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    await deliveryOrThrow(deliveryId, organizationId, tx);
    const exception = await tx.deliveryException.create({ data: { organizationId, deliveryId, category, note: note?.trim() || undefined, performedById } });
    await refreshDeliveryIntelligence(deliveryId, organizationId, tx);
    return exception;
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function refreshDeliveryIntelligence(deliveryId: string, organizationId: string, outerTx?: Prisma.TransactionClient) {
  const tx = outerTx ?? prisma;
  const integrity = await computeShipmentIntegrity(deliveryId, organizationId, outerTx);
  const performance = await computeDeliveryPerformance(organizationId, 90, outerTx);
  const executiveSummary = json({ integrity, performance, recommendationOwner: "EXECUTIVE_INTELLIGENCE", omittedCapabilities: ["DISPATCH_PLANNING", "LOADING_INTELLIGENCE"] });
  await tx.delivery.updateMany({ where: { id: deliveryId, organizationId }, data: { executiveSummary } });
  return { integrity, performance };
}
