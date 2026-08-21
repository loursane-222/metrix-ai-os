import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import { validateCustomerCustomFieldValue } from "@/lib/field-authority/custom-field.service";
import type { Prisma } from "@prisma/client";
import {
  archiveProductionOrder,
  createMachine,
  createProductionOrder,
  createWorkCenter,
  findMachineByCode,
  findProductionOrderByOrderNumber,
  findWorkCenterByCode,
  getMachineById,
  getProductionOrderById,
  getWorkCenterById,
  listMachinesForOrganization,
  listProductionOrdersForOrganization,
  listWorkCentersForOrganization,
  recordProductionOrderStatusTransition,
  updateMachine,
  updateProductionOrder,
  updateWorkCenter,
} from "./production.repository";
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

export async function createNewProductionOrder(input: CreateProductionOrderInput) {
  assert(input.organizationId, "organizationId");
  assert(input.orderNumber, "orderNumber");
  if (!(input.quantityPlanned > 0)) throw new ApiValidationError("quantityPlanned must be greater than zero.");
  if (await findProductionOrderByOrderNumber(input.organizationId, input.orderNumber)) {
    throw new ApiValidationError("A production order with this number already exists.");
  }
  return prisma.$transaction(async (tx) => {
    const order = await createProductionOrder(input, tx);
    await recordProductionOrderStatusTransition(order.id, input.organizationId, null, "DRAFT", {}, tx);
    if (input.customFields?.length) await persistCustomFields(tx, input.organizationId, order.id, input.customFields);
    return getProductionOrderById(order.id, input.organizationId, tx);
  });
}

export function listProductionOrders(input: ListProductionOrdersInput) {
  assert(input.organizationId, "organizationId");
  return listProductionOrdersForOrganization(input);
}

export function getProductionOrderByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getProductionOrderById(id, organizationId);
}

export async function updateProductionOrderDetails(input: UpdateProductionOrderInput) {
  assert(input.id, "id");
  assert(input.organizationId, "organizationId");
  if (input.orderNumber !== undefined && await findProductionOrderByOrderNumber(input.organizationId, input.orderNumber, input.id)) {
    throw new ApiValidationError("A production order with this number already exists.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await getProductionOrderById(input.id, input.organizationId, tx);
    if (!existing) throw new ApiValidationError("Production order not found.");
    const count = await updateProductionOrder(input, tx);
    if (!count.count) throw new ApiValidationError("Production order not found.");
    if (input.status !== undefined && input.status !== existing.status) {
      await recordProductionOrderStatusTransition(input.id, input.organizationId, existing.status, input.status, { reason: input.statusChangeReason }, tx);
    }
    if (input.customFields) await persistCustomFields(tx, input.organizationId, input.id, input.customFields);
    return getProductionOrderById(input.id, input.organizationId, tx);
  });
}

export async function archiveProductionOrderById(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  const result = await archiveProductionOrder(id, organizationId);
  if (!result.count) throw new ApiValidationError("Production order not found.");
}

async function persistCustomFields(tx: Prisma.TransactionClient, organizationId: string, productionOrderId: string, values: Array<{ definitionId: string; value: unknown }>) {
  const ids = [...new Set(values.map((v) => v.definitionId))];
  const defs = await tx.customFieldDefinition.findMany({ where: { organizationId, module: "production", entityType: "productionOrder", active: true, id: { in: ids } } });
  if (defs.length !== ids.length) throw new ApiValidationError("Production order custom field definition is unavailable.");
  for (const item of values) {
    const definition = defs.find((d) => d.id === item.definitionId)!;
    const value = validateCustomerCustomFieldValue(definition, organizationId, item.value);
    if (value === null || value === "") {
      await tx.productionOrderCustomFieldValue.deleteMany({ where: { productionOrderId, definitionId: item.definitionId } });
    } else {
      await tx.productionOrderCustomFieldValue.upsert({
        where: { productionOrderId_definitionId: { productionOrderId, definitionId: item.definitionId } },
        create: { organizationId, productionOrderId, definitionId: item.definitionId, valueJson: value as Prisma.InputJsonValue },
        update: { valueJson: value as Prisma.InputJsonValue },
      });
    }
  }
}

export async function createNewWorkCenter(input: CreateWorkCenterInput) {
  assert(input.organizationId, "organizationId");
  assert(input.name, "name");
  assert(input.code, "code");
  if (await findWorkCenterByCode(input.organizationId, input.code)) throw new ApiValidationError("A work center with this code already exists.");
  return createWorkCenter(input);
}

export function listWorkCenters(input: ListWorkCentersInput) {
  assert(input.organizationId, "organizationId");
  return listWorkCentersForOrganization(input);
}

export function getWorkCenterByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getWorkCenterById(id, organizationId);
}

export async function updateWorkCenterDetails(input: UpdateWorkCenterInput) {
  assert(input.id, "id");
  assert(input.organizationId, "organizationId");
  if (input.code !== undefined && await findWorkCenterByCode(input.organizationId, input.code, input.id)) {
    throw new ApiValidationError("A work center with this code already exists.");
  }
  const count = await updateWorkCenter(input);
  if (!count.count) throw new ApiValidationError("Work center not found.");
  return getWorkCenterById(input.id, input.organizationId);
}

export async function createNewMachine(input: CreateMachineInput) {
  assert(input.organizationId, "organizationId");
  assert(input.workCenterId, "workCenterId");
  assert(input.name, "name");
  assert(input.code, "code");
  if (!(await getWorkCenterById(input.workCenterId, input.organizationId))) throw new ApiValidationError("Work center not found.");
  if (await findMachineByCode(input.organizationId, input.code)) throw new ApiValidationError("A machine with this code already exists.");
  return createMachine(input);
}

export function listMachines(input: ListMachinesInput) {
  assert(input.organizationId, "organizationId");
  return listMachinesForOrganization(input);
}

export function getMachineByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getMachineById(id, organizationId);
}

export async function updateMachineDetails(input: UpdateMachineInput) {
  assert(input.id, "id");
  assert(input.organizationId, "organizationId");
  if (input.code !== undefined && await findMachineByCode(input.organizationId, input.code, input.id)) {
    throw new ApiValidationError("A machine with this code already exists.");
  }
  if (input.workCenterId !== undefined && !(await getWorkCenterById(input.workCenterId, input.organizationId))) {
    throw new ApiValidationError("Work center not found.");
  }
  const count = await updateMachine(input);
  if (!count.count) throw new ApiValidationError("Machine not found.");
  return getMachineById(input.id, input.organizationId);
}

function assert(value: string, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}
