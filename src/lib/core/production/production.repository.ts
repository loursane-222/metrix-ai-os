import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma, ProductionOrderStatus } from "@prisma/client";
import type {
  CreateMachineInput,
  CreateProductionOrderInput,
  CreateWorkCenterInput,
  ListMachinesInput,
  ListProductionOrdersInput,
  ListWorkCentersInput,
  UpdateMachineInput,
  UpdateProductionOrderInput,
  UpdateWorkCenterInput,
} from "./production.types";

const productionOrderInclude = { workCenter: true, statusHistory: { orderBy: { createdAt: "asc" as const } }, customFieldValues: true } as const;

export function findProductionOrderByOrderNumber(organizationId: string, orderNumber: string, excludeId?: string) {
  return prisma.productionOrder.findFirst({ where: { organizationId, orderNumber, id: excludeId ? { not: excludeId } : undefined } });
}

export function createProductionOrder(input: CreateProductionOrderInput, tx: Prisma.TransactionClient = prisma) {
  return tx.productionOrder.create({
    data: {
      organizationId: input.organizationId,
      orderNumber: input.orderNumber.trim(),
      sourceOrderId: input.sourceOrderId,
      productServiceId: input.productServiceId,
      workCenterId: input.workCenterId,
      quantityPlanned: input.quantityPlanned,
      plannedStartAt: input.plannedStartAt ? new Date(input.plannedStartAt) : undefined,
      plannedEndAt: input.plannedEndAt ? new Date(input.plannedEndAt) : undefined,
      notes: input.notes,
    },
  });
}

export function getProductionOrderById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.productionOrder.findFirst({ where: { id, organizationId }, include: productionOrderInclude });
}

export function listProductionOrdersForOrganization(input: ListProductionOrdersInput) {
  return prisma.productionOrder.findMany({
    where: { organizationId: input.organizationId, status: input.status },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
    include: productionOrderInclude,
  });
}

export function updateProductionOrder(input: UpdateProductionOrderInput, tx: Prisma.TransactionClient = prisma) {
  const data: Prisma.ProductionOrderUncheckedUpdateManyInput = {};
  if (input.orderNumber !== undefined) data.orderNumber = input.orderNumber.trim();
  if (input.status !== undefined) data.status = input.status;
  if (input.sourceOrderId !== undefined) data.sourceOrderId = input.sourceOrderId ?? null;
  if (input.productServiceId !== undefined) data.productServiceId = input.productServiceId ?? null;
  if (input.workCenterId !== undefined) data.workCenterId = input.workCenterId ?? null;
  if (input.quantityPlanned !== undefined) data.quantityPlanned = input.quantityPlanned;
  if (input.quantityProduced !== undefined) data.quantityProduced = input.quantityProduced;
  if (input.plannedStartAt !== undefined) data.plannedStartAt = input.plannedStartAt ? new Date(input.plannedStartAt) : null;
  if (input.plannedEndAt !== undefined) data.plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null;
  if (input.actualStartAt !== undefined) data.actualStartAt = input.actualStartAt ? new Date(input.actualStartAt) : null;
  if (input.actualEndAt !== undefined) data.actualEndAt = input.actualEndAt ? new Date(input.actualEndAt) : null;
  if (input.notes !== undefined) data.notes = input.notes;
  return tx.productionOrder.updateMany({ where: { id: input.id, organizationId: input.organizationId }, data });
}

export function recordProductionOrderStatusTransition(
  productionOrderId: string,
  organizationId: string,
  fromStatus: ProductionOrderStatus | null,
  toStatus: ProductionOrderStatus,
  opts: { reason?: string; performedById?: string },
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.productionOrderStatusHistory.create({
    data: { organizationId, productionOrderId, fromStatus, toStatus, reason: opts.reason, performedById: opts.performedById },
  });
}

export function archiveProductionOrder(id: string, organizationId: string) {
  return prisma.productionOrder.updateMany({ where: { id, organizationId }, data: { status: "CANCELLED" } });
}

export function findWorkCenterByCode(organizationId: string, code: string, excludeId?: string) {
  return prisma.workCenter.findFirst({ where: { organizationId, code, id: excludeId ? { not: excludeId } : undefined } });
}

export function createWorkCenter(input: CreateWorkCenterInput, tx: Prisma.TransactionClient = prisma) {
  return tx.workCenter.create({ data: { organizationId: input.organizationId, name: input.name.trim(), code: input.code.trim(), notes: input.notes } });
}

export function getWorkCenterById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.workCenter.findFirst({ where: { id, organizationId }, include: { machines: true } });
}

export function listWorkCentersForOrganization(input: ListWorkCentersInput) {
  return prisma.workCenter.findMany({ where: { organizationId: input.organizationId, status: input.status }, orderBy: { name: "asc" }, take: Math.min(input.limit ?? 100, 500), include: { machines: true } });
}

export function updateWorkCenter(input: UpdateWorkCenterInput, tx: Prisma.TransactionClient = prisma) {
  const data: Prisma.WorkCenterUpdateManyMutationInput = {};
  for (const key of ["name", "code", "notes"] as const) if (input[key] !== undefined) data[key] = input[key]!.trim();
  if (input.status !== undefined) data.status = input.status;
  return tx.workCenter.updateMany({ where: { id: input.id, organizationId: input.organizationId }, data });
}

export function findMachineByCode(organizationId: string, code: string, excludeId?: string) {
  return prisma.machine.findFirst({ where: { organizationId, code, id: excludeId ? { not: excludeId } : undefined } });
}

export function createMachine(input: CreateMachineInput, tx: Prisma.TransactionClient = prisma) {
  return tx.machine.create({ data: { organizationId: input.organizationId, workCenterId: input.workCenterId, name: input.name.trim(), code: input.code.trim(), notes: input.notes } });
}

export function getMachineById(id: string, organizationId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.machine.findFirst({ where: { id, organizationId } });
}

export function listMachinesForOrganization(input: ListMachinesInput) {
  return prisma.machine.findMany({ where: { organizationId: input.organizationId, workCenterId: input.workCenterId, status: input.status }, orderBy: { name: "asc" }, take: Math.min(input.limit ?? 100, 500) });
}

export function updateMachine(input: UpdateMachineInput, tx: Prisma.TransactionClient = prisma) {
  const data: Prisma.MachineUncheckedUpdateManyInput = {};
  for (const key of ["name", "code", "notes"] as const) if (input[key] !== undefined) data[key] = input[key]!.trim();
  if (input.status !== undefined) data.status = input.status;
  if (input.workCenterId !== undefined) data.workCenterId = input.workCenterId;
  return tx.machine.updateMany({ where: { id: input.id, organizationId: input.organizationId }, data });
}
