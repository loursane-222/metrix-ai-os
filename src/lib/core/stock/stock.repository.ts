import { prisma } from "@/lib/core/shared/prisma";
import type { StockStatus, MovementType, MovementSourceType, Prisma } from "@prisma/client";
import type { CreateWarehouseInput, ListStockInput, ReceiveStockInput } from "./stock.types";

const stockInclude = {
  productService: true,
  warehouse: true,
  movements: { orderBy: { createdAt: "desc" as const }, take: 10 },
  customFieldValues: true,
} as const;

export function getStockById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.stock.findFirst({ where: { id, organizationId }, include: stockInclude });
}

export function listStockForOrganization(input: ListStockInput, tx: Prisma.TransactionClient = prisma) {
  return tx.stock.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.productServiceId ? { productServiceId: input.productServiceId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: stockInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

// listStockForOrganization caps at take (a payload-size limit) — the real
// total, unbounded by that cap, for callers that need to display "how many
// total" rather than "how many loaded".
export function countStockForOrganization(input: Pick<ListStockInput, "organizationId" | "warehouseId" | "productServiceId" | "status">, tx: Prisma.TransactionClient = prisma) {
  return tx.stock.count({
    where: {
      organizationId: input.organizationId,
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.productServiceId ? { productServiceId: input.productServiceId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export function createWarehouse(input: CreateWarehouseInput, tx: Prisma.TransactionClient = prisma) {
  return tx.warehouse.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      code: input.code,
      type: input.type,
      address: input.address,
      notes: input.notes,
    },
  });
}

export function listWarehouses(organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.warehouse.findMany({
    where: { organizationId },
    include: { stocks: { include: { productService: true } } },
    orderBy: { name: "asc" },
  });
}

export function findWarehouseById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.warehouse.findFirst({ where: { id, organizationId } });
}

export async function archiveWarehouse(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  await tx.warehouse.updateMany({ where: { id, organizationId }, data: { status: "ARCHIVED" } });
}

export function findAvailableStockRows(
  organizationId: string,
  productServiceId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.stock.findMany({
    where: { organizationId, productServiceId, status: "AVAILABLE" },
    orderBy: { createdAt: "asc" },
  });
}

export function findStockBucket(
  key: { organizationId: string; productServiceId: string; warehouseId: string; status: StockStatus; lot?: string | null; batch?: string | null; serialNumber?: string | null },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.stock.findFirst({
    where: {
      organizationId: key.organizationId,
      productServiceId: key.productServiceId,
      warehouseId: key.warehouseId,
      status: key.status,
      lot: key.lot ?? null,
      batch: key.batch ?? null,
      serialNumber: key.serialNumber ?? null,
    },
  });
}

export function createStockRow(
  data: {
    organizationId: string;
    productServiceId: string;
    warehouseId: string;
    status: StockStatus;
    quantity: number;
    reservedQuantity?: number;
    location?: string;
    lot?: string;
    batch?: string;
    serialNumber?: string;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.stock.create({ data: { ...data, reservedQuantity: data.reservedQuantity ?? 0 } });
}

export function updateStockQuantity(
  id: string,
  organizationId: string,
  delta: { quantity?: number; reservedQuantity?: number },
  tx: Prisma.TransactionClient = prisma,
) {
  const data: { quantity?: { increment: number } | { decrement: number }; reservedQuantity?: { increment: number } | { decrement: number } } = {};
  if (delta.quantity !== undefined) {
    data.quantity = delta.quantity >= 0 ? { increment: delta.quantity } : { decrement: -delta.quantity };
  }
  if (delta.reservedQuantity !== undefined) {
    data.reservedQuantity = delta.reservedQuantity >= 0 ? { increment: delta.reservedQuantity } : { decrement: -delta.reservedQuantity };
  }
  return tx.stock.update({ where: { id }, data });
}

export function recordMovement(
  data: {
    organizationId: string;
    stockId: string;
    movementType: MovementType;
    quantity: number;
    sourceType: MovementSourceType;
    sourceId?: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    fromStatus?: StockStatus;
    toStatus?: StockStatus;
    reason?: string;
    performedById?: string;
    evidence?: Record<string, unknown>;
    supplierId?: string;
    expectedAt?: Date;
    unitCostCents?: bigint;
    qualityFlag?: string;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.stockMovement.create({
    data: {
      organizationId: data.organizationId,
      stockId: data.stockId,
      movementType: data.movementType,
      quantity: data.quantity,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      reason: data.reason,
      performedById: data.performedById,
      evidence: data.evidence as Prisma.InputJsonValue | undefined,
      supplierId: data.supplierId,
      expectedAt: data.expectedAt,
      unitCostCents: data.unitCostCents,
      qualityFlag: data.qualityFlag,
    },
  });
}
