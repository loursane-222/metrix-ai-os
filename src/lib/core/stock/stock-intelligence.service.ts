import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";
import { recordMovement, updateStockQuantity } from "./stock.repository";

export const INSUFFICIENT_CANONICAL_DATA = "INSUFFICIENT_CANONICAL_DATA" as const;
const DAY_MS = 86_400_000;
const SAMPLE_LIMIT = 5;

type SignalDetail = Readonly<{ stockId: string; days?: number; availableQuantity?: number; threshold?: number; expiresInDays?: number }>;
type SignalCategory = Readonly<{ count: number; sampleStockIds: string[]; details: SignalDetail[] }>;

function category(details: SignalDetail[]): SignalCategory {
  return { count: details.length, sampleStockIds: details.slice(0, SAMPLE_LIMIT).map((row) => row.stockId), details };
}

function elapsedDays(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

function validateWindow(windowDays: number): void {
  if (!Number.isInteger(windowDays) || windowDays <= 0) throw new ApiValidationError("windowDays must be a positive integer.");
}

export async function recordPhysicalCount(
  stockId: string,
  organizationId: string,
  countedQuantity: number,
  note?: string,
  performedById?: string,
  outerTx?: Prisma.TransactionClient,
) {
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new ApiValidationError("countedQuantity must be a non-negative number.");
  const execute = async (tx: Prisma.TransactionClient) => {
    const stock = await tx.stock.findFirst({ where: { id: stockId, organizationId }, select: { id: true, quantity: true } });
    if (!stock) throw new ApiValidationError("Stock not found.");
    const systemQuantity = Number(stock.quantity);
    const varianceQuantity = countedQuantity - systemQuantity;
    return tx.stockCountRecord.create({
      data: {
        organizationId,
        stockId,
        systemQuantityAtCount: systemQuantity,
        countedQuantity,
        varianceQuantity,
        status: varianceQuantity === 0 ? "NO_VARIANCE" : "PENDING_INVESTIGATION",
        investigationNote: note?.trim() || undefined,
        performedById,
      },
    });
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function resolveInventoryVariance(
  countRecordId: string,
  organizationId: string,
  resolution: "CONFIRM" | "DISMISS",
  note?: string,
  performedById?: string,
  outerTx?: Prisma.TransactionClient,
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const countRecord = await tx.stockCountRecord.findFirst({
      where: { id: countRecordId, organizationId },
      include: { stock: { select: { id: true, quantity: true, status: true } } },
    });
    if (!countRecord) throw new ApiValidationError("Stock count record not found.");
    if (countRecord.status !== "PENDING_INVESTIGATION") throw new ApiValidationError("Only pending inventory variances can be resolved.");

    const resolvedAt = new Date();
    if (resolution === "DISMISS") {
      await tx.stockCountRecord.updateMany({
        where: { id: countRecord.id, organizationId, status: "PENDING_INVESTIGATION" },
        data: { status: "DISMISSED", investigationNote: note?.trim() || countRecord.investigationNote, performedById: performedById ?? countRecord.performedById, resolvedAt },
      });
      return tx.stockCountRecord.findFirstOrThrow({ where: { id: countRecord.id, organizationId } });
    }

    const delta = Number(countRecord.countedQuantity) - Number(countRecord.stock.quantity);
    if (delta !== 0) await updateStockQuantity(countRecord.stock.id, organizationId, { quantity: delta }, tx);
    const movement = await recordMovement({
      organizationId,
      stockId: countRecord.stock.id,
      movementType: "ADJUSTMENT",
      quantity: delta,
      sourceType: "ADJUSTMENT",
      sourceId: countRecord.id,
      fromStatus: countRecord.stock.status,
      toStatus: countRecord.stock.status,
      reason: note?.trim() || countRecord.investigationNote || "Fiziksel sayım farkı onaylandı",
      performedById,
      evidence: { countRecordId: countRecord.id, systemQuantityAtCount: countRecord.systemQuantityAtCount.toString(), countedQuantity: countRecord.countedQuantity.toString() },
    }, tx);
    await tx.stockCountRecord.updateMany({
      where: { id: countRecord.id, organizationId, status: "PENDING_INVESTIGATION" },
      data: { status: "CORRECTED", correctionMovementId: movement.id, investigationNote: note?.trim() || countRecord.investigationNote, performedById: performedById ?? countRecord.performedById, resolvedAt },
    });
    return tx.stockCountRecord.findFirstOrThrow({ where: { id: countRecord.id, organizationId } });
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export function listPendingInventoryVariances(organizationId: string, outerTx: Prisma.TransactionClient = prisma) {
  return outerTx.stockCountRecord.findMany({
    where: { organizationId, status: "PENDING_INVESTIGATION" },
    include: { stock: { include: { productService: true, warehouse: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function computeStockHealth(organizationId: string, windowDays = 90, outerTx: Prisma.TransactionClient = prisma) {
  validateWindow(windowDays);
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const stocks = await outerTx.stock.findMany({
    where: { organizationId, status: { notIn: ["ARCHIVED", "SCRAPPED"] } },
    include: { productService: { select: { minStockLevel: true, maxStockLevel: true } }, movements: { orderBy: { createdAt: "desc" } } },
  });

  const neverMoved: SignalDetail[] = [];
  const inactive: SignalDetail[] = [];
  const longReservedOrAllocated: SignalDetail[] = [];
  const longQuarantine: SignalDetail[] = [];
  const criticalStock: SignalDetail[] = [];
  const excessStock: SignalDetail[] = [];
  const expiryRisk: SignalDetail[] = [];
  const qualityProblems: SignalDetail[] = [];

  for (const stock of stocks) {
    const lastMovement = stock.movements[0];
    if (!lastMovement) neverMoved.push({ stockId: stock.id });
    else {
      const days = elapsedDays(lastMovement.createdAt, now);
      if (days > windowDays) inactive.push({ stockId: stock.id, days });
    }

    if (stock.status === "RESERVED" || stock.status === "ALLOCATED") {
      const transition = stock.movements.find((movement) => movement.toStatus === stock.status);
      if (transition) {
        const days = elapsedDays(transition.createdAt, now);
        if (days > windowDays) longReservedOrAllocated.push({ stockId: stock.id, days });
      }
    }
    if (stock.status === "QUARANTINE") {
      const transition = stock.movements.find((movement) => movement.toStatus === "QUARANTINE");
      if (transition) {
        const days = elapsedDays(transition.createdAt, now);
        if (days > windowDays) longQuarantine.push({ stockId: stock.id, days });
      }
    }

    const availableQuantity = Number(stock.quantity) - Number(stock.reservedQuantity);
    if (stock.productService.minStockLevel !== null && availableQuantity < Number(stock.productService.minStockLevel)) {
      criticalStock.push({ stockId: stock.id, availableQuantity, threshold: Number(stock.productService.minStockLevel) });
    }
    if (stock.productService.maxStockLevel !== null && availableQuantity > Number(stock.productService.maxStockLevel)) {
      excessStock.push({ stockId: stock.id, availableQuantity, threshold: Number(stock.productService.maxStockLevel) });
    }
    if (stock.expiresAt !== null) {
      const expiresInDays = Math.ceil((stock.expiresAt.getTime() - now.getTime()) / DAY_MS);
      if (expiresInDays <= 14) expiryRisk.push({ stockId: stock.id, expiresInDays });
    }
    if (stock.status === "DAMAGED" || stock.movements.some((movement) => movement.createdAt >= since && movement.qualityFlag !== null && movement.qualityFlag !== "OK")) {
      qualityProblems.push({ stockId: stock.id });
    }
  }

  const categories = {
    neverMoved: category(neverMoved), inactive: category(inactive), longReservedOrAllocated: category(longReservedOrAllocated),
    longQuarantine: category(longQuarantine), criticalStock: category(criticalStock), excessStock: category(excessStock),
    expiryRisk: category(expiryRisk), qualityProblems: category(qualityProblems),
  };
  const signalCount = Object.values(categories).reduce((sum, item) => sum + item.count, 0);
  const healthSummary = signalCount === 0
    ? INSUFFICIENT_CANONICAL_DATA
    : `Kritik stok ${criticalStock.length}, aşırı stok ${excessStock.length}, kalite ${qualityProblems.length}, SKT riski ${expiryRisk.length}, hareketsizlik ${neverMoved.length + inactive.length}, uzun süreli rezervasyon/karantina ${longReservedOrAllocated.length + longQuarantine.length}.`;
  return { status: signalCount ? "AVAILABLE" as const : INSUFFICIENT_CANONICAL_DATA, windowDays, stockRowCount: stocks.length, signalCount, categories, healthSummary };
}

export async function computeExecutiveSignals(organizationId: string, windowDays = 90, outerTx: Prisma.TransactionClient = prisma) {
  const [health, openVarianceCount] = await Promise.all([
    computeStockHealth(organizationId, windowDays, outerTx),
    outerTx.stockCountRecord.count({ where: { organizationId, status: "PENDING_INVESTIGATION" } }),
  ]);
  const riskSignalCount = health.categories.criticalStock.count + health.categories.qualityProblems.count + health.categories.expiryRisk.count + openVarianceCount;
  const opportunitySignalCount = health.categories.excessStock.count;
  const operationalSignalCount = health.categories.neverMoved.count + health.categories.inactive.count + health.categories.longReservedOrAllocated.count + health.categories.longQuarantine.count;
  const total = riskSignalCount + opportunitySignalCount + operationalSignalCount;
  return {
    status: total ? "AVAILABLE" as const : INSUFFICIENT_CANONICAL_DATA,
    windowDays,
    healthSummary: health.healthSummary,
    openVarianceCount,
    riskSignalCount,
    opportunitySignalCount,
    operationalSignalCount,
    buckets: {
      risk: { criticalStock: health.categories.criticalStock, qualityProblems: health.categories.qualityProblems, expiryRisk: health.categories.expiryRisk, openVarianceCount },
      opportunity: { excessStock: health.categories.excessStock },
      operational: { neverMoved: health.categories.neverMoved, inactive: health.categories.inactive, longReservedOrAllocated: health.categories.longReservedOrAllocated, longQuarantine: health.categories.longQuarantine },
    },
    omittedOperationalCategories: ["Yoğun toplama alanı", "Darboğaz", "Kapasite doluluğu", "Transfer ihtiyacı", "Depo optimizasyonu"],
    omissionReason: "Kanonik konum hiyerarşisi ve depo kapasite verisi bulunmuyor.",
    recommendationOwner: "EXECUTIVE_INTELLIGENCE" as const,
  };
}
