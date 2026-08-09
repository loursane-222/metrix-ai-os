import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";

const INSUFFICIENT = "INSUFFICIENT_CANONICAL_DATA" as const;
const DAY_MS = 86_400_000;

type DeliveryPerformance = {
  status: typeof INSUFFICIENT | "AVAILABLE";
  totalReceipts: number;
  measuredReceipts: number;
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  onTimeRate: number | null;
  averageDeviationDays: number | null;
};
type QualityPerformance = {
  status: typeof INSUFFICIENT | "AVAILABLE";
  measuredReceipts: number;
  okCount: number;
  damagedCount: number;
  partialCount: number;
  qualityRate: number | null;
  byProduct: Record<string, { ok: number; damaged: number; partial: number }>;
};
type PricingPerformance = {
  status: typeof INSUFFICIENT | "AVAILABLE";
  byProduct: Record<string, { firstUnitCostCents: string; lastUnitCostCents: string; ratio: number | null; increasePercent: number | null }>;
  averagePricingScore: number | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function supplierReceipts(supplierId: string, organizationId: string) {
  return prisma.stockMovement.findMany({
    where: { organizationId, supplierId, sourceType: "SUPPLIER", movementType: "RECEIPT" },
    include: { stock: { select: { productServiceId: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function computeSupplierDeliveryPerformance(supplierId: string, organizationId: string): Promise<DeliveryPerformance> {
  const receipts = await supplierReceipts(supplierId, organizationId);
  const measured = receipts.filter((receipt) => receipt.expectedAt);
  const deviations = measured.map((receipt) => (receipt.createdAt.getTime() - receipt.expectedAt!.getTime()) / DAY_MS);
  const result: DeliveryPerformance = {
    status: measured.length ? "AVAILABLE" : INSUFFICIENT,
    totalReceipts: receipts.length,
    measuredReceipts: measured.length,
    onTimeCount: deviations.filter((days) => Math.abs(days) < 1).length,
    earlyCount: deviations.filter((days) => days <= -1).length,
    lateCount: deviations.filter((days) => days >= 1).length,
    onTimeRate: measured.length ? round((deviations.filter((days) => days < 1).length / measured.length) * 100) : null,
    averageDeviationDays: measured.length ? round(deviations.reduce((sum, days) => sum + days, 0) / measured.length) : null,
  };
  await prisma.supplier.updateMany({ where: { id: supplierId, organizationId }, data: { deliveryPerformance: json(result) } });
  return result;
}

export async function computeSupplierQualityPerformance(supplierId: string, organizationId: string): Promise<QualityPerformance> {
  const receipts = await supplierReceipts(supplierId, organizationId);
  const measured = receipts.filter((receipt) => receipt.qualityFlag?.trim());
  const byProduct: QualityPerformance["byProduct"] = {};
  let okCount = 0;
  let damagedCount = 0;
  let partialCount = 0;
  for (const receipt of measured) {
    const flag = receipt.qualityFlag!.toUpperCase();
    const bucket = byProduct[receipt.stock.productServiceId] ?? { ok: 0, damaged: 0, partial: 0 };
    if (flag === "OK") { okCount += 1; bucket.ok += 1; }
    else if (flag === "PARTIAL") { partialCount += 1; bucket.partial += 1; }
    else { damagedCount += 1; bucket.damaged += 1; }
    byProduct[receipt.stock.productServiceId] = bucket;
  }
  const result: QualityPerformance = { status: measured.length ? "AVAILABLE" : INSUFFICIENT, measuredReceipts: measured.length, okCount, damagedCount, partialCount, qualityRate: measured.length ? round((okCount / measured.length) * 100) : null, byProduct };
  await prisma.supplier.updateMany({ where: { id: supplierId, organizationId }, data: { qualityPerformance: json(result) } });
  return result;
}

export async function computeSupplierPricingIntelligence(supplierId: string, organizationId: string): Promise<PricingPerformance> {
  const receipts = (await supplierReceipts(supplierId, organizationId)).filter((receipt) => receipt.unitCostCents !== null);
  const grouped = new Map<string, typeof receipts>();
  for (const receipt of receipts) {
    const productServiceId = receipt.stock.productServiceId;
    grouped.set(productServiceId, [...(grouped.get(productServiceId) ?? []), receipt]);
  }
  const byProduct: PricingPerformance["byProduct"] = {};
  const productScores: number[] = [];
  for (const [productServiceId, rows] of grouped) {
    const first = rows[0]!.unitCostCents!;
    const last = rows.at(-1)!.unitCostCents!;
    const ratio = first > BigInt(0) ? Number(last) / Number(first) : null;
    const increasePercent = ratio === null ? null : round((ratio - 1) * 100);
    byProduct[productServiceId] = { firstUnitCostCents: first.toString(), lastUnitCostCents: last.toString(), ratio: ratio === null ? null : round(ratio, 4), increasePercent };
    if (increasePercent !== null) productScores.push(Math.max(0, Math.min(100, 100 - Math.max(0, increasePercent))));
  }
  const result: PricingPerformance = { status: receipts.length ? "AVAILABLE" : INSUFFICIENT, byProduct, averagePricingScore: productScores.length ? round(productScores.reduce((sum, score) => sum + score, 0) / productScores.length) : null };
  await prisma.supplier.updateMany({ where: { id: supplierId, organizationId }, data: { pricingPerformance: json(result) } });
  return result;
}

export async function computeSupplierDependencyRisk(organizationId: string) {
  const [links, movements, suppliers] = await Promise.all([
    prisma.supplierProduct.findMany({ where: { organizationId }, select: { supplierId: true, productServiceId: true } }),
    prisma.stockMovement.findMany({ where: { organizationId, sourceType: "SUPPLIER", movementType: "RECEIPT", supplierId: { not: null } }, include: { stock: { select: { productServiceId: true } } } }),
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, riskNotes: true } }),
  ]);
  const products = new Set([...links.map((link) => link.productServiceId), ...movements.map((movement) => movement.stock.productServiceId)]);
  const risksBySupplier = new Map<string, Array<{ productServiceId: string; sharePercent: number }>>();
  for (const productServiceId of products) {
    const rows = movements.filter((movement) => movement.stock.productServiceId === productServiceId && movement.supplierId);
    const total = rows.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    const eligible = new Set(links.filter((link) => link.productServiceId === productServiceId).map((link) => link.supplierId));
    for (const row of rows) eligible.add(row.supplierId!);
    for (const supplierId of eligible) {
      const supplied = rows.filter((row) => row.supplierId === supplierId).reduce((sum, row) => sum + Number(row.quantity), 0);
      const sharePercent = total > 0 ? round((supplied / total) * 100) : 0;
      if (sharePercent > 70) risksBySupplier.set(supplierId, [...(risksBySupplier.get(supplierId) ?? []), { productServiceId, sharePercent }]);
    }
  }
  await prisma.$transaction(suppliers.map((supplier) => prisma.supplier.updateMany({ where: { id: supplier.id, organizationId }, data: { riskProfile: json({ dependencyRisk: risksBySupplier.get(supplier.id) ?? [], dependencyRiskFlag: (risksBySupplier.get(supplier.id)?.length ?? 0) > 0, manualRiskNotes: supplier.riskNotes ?? null }) } })));
  return risksBySupplier;
}

export async function computeSupplierScore(supplierId: string, organizationId: string) {
  const [delivery, quality, pricing, receiptCount] = await Promise.all([
    computeSupplierDeliveryPerformance(supplierId, organizationId),
    computeSupplierQualityPerformance(supplierId, organizationId),
    computeSupplierPricingIntelligence(supplierId, organizationId),
    prisma.stockMovement.count({ where: { organizationId, supplierId, sourceType: "SUPPLIER", movementType: "RECEIPT" } }),
  ]);
  if (!receiptCount) {
    await prisma.supplier.updateMany({ where: { id: supplierId, organizationId }, data: { score: null, executiveSummary: json({ status: INSUFFICIENT, message: INSUFFICIENT }) } });
    return null;
  }
  const components = [
    delivery.onTimeRate === null ? null : { key: "delivery", score: delivery.onTimeRate, weight: 40 },
    quality.qualityRate === null ? null : { key: "quality", score: quality.qualityRate, weight: 35 },
    pricing.averagePricingScore === null ? null : { key: "pricing", score: pricing.averagePricingScore, weight: 25 },
  ].filter((component): component is { key: string; score: number; weight: number } => component !== null);
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const score = totalWeight ? Math.round(components.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight) : null;
  await prisma.supplier.updateMany({ where: { id: supplierId, organizationId }, data: { score, executiveSummary: json({ status: score === null ? INSUFFICIENT : "AVAILABLE", receiptCount, scoreFormula: "delivery 40%, quality 35%, pricing 25%; unavailable components are omitted and remaining weights are normalized", components }) } });
  return score;
}

export function listAlternativeSuppliers(productServiceId: string, organizationId: string, excludeSupplierId?: string) {
  return prisma.supplierProduct.findMany({ where: { organizationId, productServiceId, supplierId: excludeSupplierId ? { not: excludeSupplierId } : undefined, supplier: { status: "ACTIVE" } }, include: { supplier: true, productService: true }, orderBy: { supplier: { displayName: "asc" } } });
}

export async function refreshSupplierIntelligence(supplierId: string, organizationId: string) {
  await computeSupplierDependencyRisk(organizationId);
  return computeSupplierScore(supplierId, organizationId);
}
