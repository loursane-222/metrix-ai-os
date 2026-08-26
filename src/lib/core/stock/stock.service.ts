import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { Prisma } from "@prisma/client";
import {
  archiveWarehouse,
  createStockRow,
  createWarehouse,
  findAvailableStockRows,
  findStockBucket,
  findWarehouseById,
  getStockById,
  listStockForOrganization,
  listWarehouses,
  recordMovement,
  updateStockQuantity,
} from "./stock.repository";
import { recordPhysicalCount, resolveInventoryVariance } from "./stock-intelligence.service";
import type { AdjustStockInput, CreateWarehouseInput, ListStockInput, ReceiveStockInput, TransferStockInput } from "./stock.types";

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export function listStock(input: ListStockInput) {
  assert(input.organizationId, "organizationId");
  return listStockForOrganization(input);
}

export function getStockByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getStockById(id, organizationId);
}

export function createNewWarehouse(input: CreateWarehouseInput) {
  assert(input.organizationId, "organizationId");
  assert(input.name, "name");
  assert(input.code, "code");
  return createWarehouse(input);
}

export function listWarehousesForOrganization(organizationId: string) {
  assert(organizationId, "organizationId");
  return listWarehouses(organizationId);
}

// Read-only lookup for callers that need the pre-mutation quantity of the
// bucket stock.adjustment/stock.receive/stock.transfer would touch (e.g.
// orchestration compensation's "before" snapshot) without performing any
// mutation themselves.
export function findAvailableStockBucket(
  organizationId: string,
  productServiceId: string,
  warehouseId: string,
  lot?: string | null,
  batch?: string | null,
  serialNumber?: string | null,
) {
  return findStockBucket({ organizationId, productServiceId, warehouseId, status: "AVAILABLE", lot, batch, serialNumber });
}

export function getWarehouseByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return findWarehouseById(id, organizationId);
}

export async function archiveWarehouseById(id: string, organizationId: string): Promise<void> {
  assert(id, "id");
  assert(organizationId, "organizationId");
  await archiveWarehouse(id, organizationId);
}

export async function receiveStock(input: ReceiveStockInput, outerTx?: Prisma.TransactionClient) {
  assert(input.organizationId, "organizationId");
  assert(input.productServiceId, "productServiceId");
  assert(input.warehouseId, "warehouseId");
  if (input.quantity <= 0) throw new ApiValidationError("quantity must be positive.");

  const exec = async (tx: Prisma.TransactionClient) => {
    const existing = await findStockBucket(
      { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.warehouseId, status: "AVAILABLE", lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
      tx,
    );

    let stockId: string;
    if (existing) {
      await updateStockQuantity(existing.id, input.organizationId, { quantity: input.quantity }, tx);
      stockId = existing.id;
    } else {
      const created = await createStockRow(
        { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.warehouseId, status: "AVAILABLE", quantity: input.quantity, location: input.location, lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
        tx,
      );
      stockId = created.id;
    }

    if (input.supplierId) {
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, organizationId: input.organizationId }, select: { id: true } });
      if (!supplier) throw new ApiValidationError("Supplier not found.");
    }
    await recordMovement({ organizationId: input.organizationId, stockId, movementType: "RECEIPT", quantity: input.quantity, sourceType: input.supplierId ? "SUPPLIER" : "MANUAL", sourceId: input.supplierId, supplierId: input.supplierId, expectedAt: input.expectedAt, unitCostCents: input.unitCostCents, qualityFlag: input.qualityFlag, reason: input.reason, performedById: input.performedById, toStatus: "AVAILABLE" }, tx);
    return stockId;
  };

  if (outerTx) {
    const stockId = await exec(outerTx);
    return getStockById(stockId, input.organizationId, outerTx);
  }
  const stockId = await prisma.$transaction(exec);
  const result = await getStockById(stockId, input.organizationId);
  if (input.supplierId) {
    const { refreshSupplierIntelligence } = await import("@/lib/core/suppliers/supplier-intelligence.service");
    await refreshSupplierIntelligence(input.supplierId, input.organizationId);
  }
  return result;
}

export async function transferStock(input: TransferStockInput, outerTx?: Prisma.TransactionClient) {
  assert(input.organizationId, "organizationId");
  assert(input.productServiceId, "productServiceId");
  assert(input.fromWarehouseId, "fromWarehouseId");
  assert(input.toWarehouseId, "toWarehouseId");
  if (input.quantity <= 0) throw new ApiValidationError("quantity must be positive.");
  if (input.fromWarehouseId === input.toWarehouseId) throw new ApiValidationError("Source and destination warehouses must differ.");

  const exec = async (tx: Prisma.TransactionClient) => {
    const source = await findStockBucket(
      { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.fromWarehouseId, status: "AVAILABLE", lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
      tx,
    );
    if (!source) throw new ApiValidationError("No AVAILABLE stock found in source warehouse for this product.");

    const available = Number(source.quantity) - Number(source.reservedQuantity);
    if (available < input.quantity) {
      throw new ApiValidationError(`Insufficient available stock: ${available} available, ${input.quantity} requested.`);
    }

    await updateStockQuantity(source.id, input.organizationId, { quantity: -input.quantity }, tx);

    const dest = await findStockBucket(
      { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.toWarehouseId, status: "AVAILABLE", lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
      tx,
    );

    let destId: string;
    if (dest) {
      await updateStockQuantity(dest.id, input.organizationId, { quantity: input.quantity }, tx);
      destId = dest.id;
    } else {
      const created = await createStockRow(
        { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.toWarehouseId, status: "AVAILABLE", quantity: input.quantity, lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
        tx,
      );
      destId = created.id;
    }

    await recordMovement({ organizationId: input.organizationId, stockId: source.id, movementType: "TRANSFER_OUT", quantity: input.quantity, sourceType: "MANUAL", fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, reason: input.reason, performedById: input.performedById }, tx);
    await recordMovement({ organizationId: input.organizationId, stockId: destId, movementType: "TRANSFER_IN", quantity: input.quantity, sourceType: "MANUAL", fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, reason: input.reason, performedById: input.performedById }, tx);

    return { sourceId: source.id, destinationId: destId };
  };

  if (outerTx) {
    const ids = await exec(outerTx);
    const source = await getStockById(ids.sourceId, input.organizationId, outerTx);
    const destination = await getStockById(ids.destinationId, input.organizationId, outerTx);
    return { source, destination };
  }
  const ids = await prisma.$transaction(exec);
  const [source, destination] = await Promise.all([
    getStockById(ids.sourceId, input.organizationId),
    getStockById(ids.destinationId, input.organizationId),
  ]);
  return { source, destination };
}

// Direct, single-step correction for the action-runtime `stock.adjustment`
// action — composes the domain's existing count/variance/resolve building
// blocks (recordPhysicalCount + resolveInventoryVariance) into one atomic
// call instead of duplicating their logic. Unlike a manager reviewing a
// pending count later, the caller here already passed action-runtime's own
// permission/approval checks, so the correction is confirmed immediately —
// the same trust level stock.receive already applies to inventory writes.
export async function adjustStockQuantity(input: AdjustStockInput, outerTx?: Prisma.TransactionClient) {
  assert(input.organizationId, "organizationId");
  assert(input.productServiceId, "productServiceId");
  assert(input.warehouseId, "warehouseId");
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) {
    throw new ApiValidationError("countedQuantity must be a non-negative number.");
  }

  const exec = async (tx: Prisma.TransactionClient) => {
    const bucket = await findStockBucket(
      { organizationId: input.organizationId, productServiceId: input.productServiceId, warehouseId: input.warehouseId, status: "AVAILABLE", lot: input.lot, batch: input.batch, serialNumber: input.serialNumber },
      tx,
    );
    if (!bucket) throw new ApiValidationError("No AVAILABLE stock found for this product/warehouse to adjust.");

    const countRecord = await recordPhysicalCount(bucket.id, input.organizationId, input.countedQuantity, input.reason, input.performedById, tx);
    if (countRecord.status === "PENDING_INVESTIGATION") {
      await resolveInventoryVariance(countRecord.id, input.organizationId, "CONFIRM", input.reason, input.performedById, tx);
    }
    return bucket.id;
  };

  const stockId = outerTx ? await exec(outerTx) : await prisma.$transaction(exec);
  return getStockById(stockId, input.organizationId, outerTx);
}

// §13/§22 Reservation — called by order.service when Order transitions to APPROVED.
// Does NOT block the order transition on shortfall; writes shortfall to riskSignals instead.
export async function reserveStockForOrder(orderId: string, organizationId: string, tx: Prisma.TransactionClient) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId },
    include: { items: true },
  });
  if (!order) return;

  const reservedInventory: { productServiceId: string; orderItemId: string; stockId: string; reserved: number }[] = [];
  const shortfalls: { productServiceId: string; orderItemId: string; requested: number; available: number }[] = [];

  for (const item of order.items) {
    if (!item.productServiceId) continue;

    const needed = Number(item.quantity);
    const stockRows = await findAvailableStockRows(organizationId, item.productServiceId, tx);

    let remaining = needed;
    for (const row of stockRows) {
      if (remaining <= 0) break;
      const canReserve = Math.min(Number(row.quantity) - Number(row.reservedQuantity), remaining);
      if (canReserve <= 0) continue;
      await updateStockQuantity(row.id, organizationId, { reservedQuantity: canReserve }, tx);
      await recordMovement({ organizationId, stockId: row.id, movementType: "RESERVE", quantity: canReserve, sourceType: "ORDER", sourceId: orderId }, tx);
      reservedInventory.push({ productServiceId: item.productServiceId, orderItemId: item.id, stockId: row.id, reserved: canReserve });
      remaining -= canReserve;
    }

    if (remaining > 0) {
      const totalAvailable = stockRows.reduce((sum, r) => sum + Math.max(0, Number(r.quantity) - Number(r.reservedQuantity)), 0);
      shortfalls.push({ productServiceId: item.productServiceId, orderItemId: item.id, requested: needed, available: totalAvailable });
    }
  }

  const updates: { reservedInventory: typeof reservedInventory; riskSignals?: { stockShortfall: typeof shortfalls } } = { reservedInventory };
  if (shortfalls.length > 0) {
    updates.riskSignals = { stockShortfall: shortfalls };
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      reservedInventory: reservedInventory as unknown as Prisma.InputJsonValue,
      ...(shortfalls.length > 0 ? { riskSignals: { stockShortfall: shortfalls } as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

// §11/§18 Consumption — called by delivery.service when Delivery transitions to DISPATCHED.
// Never blocks the delivery; records "unmatched consumption" in evidence if stock is insufficient.
export async function consumeStockForDelivery(deliveryId: string, organizationId: string, tx: Prisma.TransactionClient) {
  const delivery = await tx.delivery.findFirst({
    where: { id: deliveryId, organizationId },
    include: { items: { include: { orderItem: true } }, sourceOrder: true },
  });
  if (!delivery) return;

  const reservedInventoryRaw = delivery.sourceOrder?.reservedInventory;
  const reservedMap = new Map<string, { stockId: string; reserved: number }[]>();

  if (Array.isArray(reservedInventoryRaw)) {
    for (const entry of reservedInventoryRaw as { orderItemId: string; stockId: string; reserved: number }[]) {
      if (!reservedMap.has(entry.orderItemId)) reservedMap.set(entry.orderItemId, []);
      reservedMap.get(entry.orderItemId)!.push({ stockId: entry.stockId, reserved: entry.reserved });
    }
  }

  for (const deliveryItem of delivery.items) {
    const productServiceId = deliveryItem.productServiceId ?? deliveryItem.orderItem?.productServiceId;
    if (!productServiceId) continue;

    const consume = Number(deliveryItem.quantity);
    let remaining = consume;

    const reservedEntries = reservedMap.get(deliveryItem.orderItemId) ?? [];

    for (const entry of reservedEntries) {
      if (remaining <= 0) break;
      const stock = await tx.stock.findFirst({ where: { id: entry.stockId, organizationId } });
      if (!stock) continue;
      const toConsume = Math.min(remaining, Math.min(Number(stock.reservedQuantity), Number(stock.quantity)));
      if (toConsume <= 0) continue;
      await updateStockQuantity(stock.id, organizationId, { quantity: -toConsume, reservedQuantity: -toConsume }, tx);
      await recordMovement({ organizationId, stockId: stock.id, movementType: "CONSUME", quantity: toConsume, sourceType: "DELIVERY", sourceId: deliveryId }, tx);
      remaining -= toConsume;
    }

    if (remaining > 0) {
      const availableRows = await findAvailableStockRows(organizationId, productServiceId, tx);
      for (const row of availableRows) {
        if (remaining <= 0) break;
        const toConsume = Math.min(remaining, Number(row.quantity));
        if (toConsume <= 0) continue;
        await updateStockQuantity(row.id, organizationId, { quantity: -toConsume }, tx);
        await recordMovement({ organizationId, stockId: row.id, movementType: "CONSUME", quantity: toConsume, sourceType: "DELIVERY", sourceId: deliveryId, evidence: { unmatchedConsumption: true, note: "consumed from unreserved stock" } }, tx);
        remaining -= toConsume;
      }
    }

    if (remaining > 0) {
      const firstRow = await tx.stock.findFirst({ where: { organizationId, productServiceId } });
      if (firstRow) {
        await recordMovement({ organizationId, stockId: firstRow.id, movementType: "CONSUME", quantity: remaining, sourceType: "DELIVERY", sourceId: deliveryId, evidence: { unmatchedConsumption: true, note: "insufficient stock — delivery physically occurred but stock not decremented" } }, tx);
      }
    }
  }
}
