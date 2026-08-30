import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import {
  countPurchaseOrdersForOrganization,
  createPurchaseOrder,
  createPurchaseOrderItems,
  generatePurchaseOrderNumber,
  getPurchaseOrderById,
  listPurchaseOrdersForOrganization,
  PurchaseOrderConcurrentlyModifiedError,
  updatePurchaseOrderStatus,
} from "./purchase-order.repository";
import type {
  CancelPurchaseOrderInput,
  CreatePurchaseOrderInput,
  ListPurchaseOrdersInput,
  TransitionPurchaseOrderStatusInput,
} from "./purchase-order.types";

// §Phase 9 — PO commercial commitment lifecycle. PARTIALLY_RECEIVED/RECEIVED
// are reachable manually here (mirroring order.service.ts's own
// transitionStatus surface) but in practice are driven automatically by
// goods-receipt.service.ts's syncPurchaseOrderReceiptStatus, the same way
// Order's SHIPPED/PARTIALLY_SHIPPED are driven by delivery dispatch.
export const ALLOWED_PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

// Goods Receipt is only permitted against a PO that has actually committed
// to the purchase (APPROVED) or is already mid-delivery (PARTIALLY_RECEIVED)
// — never a DRAFT still being negotiated/edited.
export const RECEIVABLE_PURCHASE_ORDER_STATUSES = ["APPROVED", "PARTIALLY_RECEIVED"] as const;

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export async function createNewPurchaseOrder(input: CreatePurchaseOrderInput) {
  assert(input.organizationId, "organizationId");
  assert(input.supplierId, "supplierId");

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, organizationId: input.organizationId } });
    if (!supplier) throw new ApiValidationError("Supplier not found.", 404);

    const poNumber = await generatePurchaseOrderNumber(input.organizationId, tx);
    const purchaseOrder = await createPurchaseOrder({ ...input, poNumber }, tx);
    if (input.items?.length) {
      await createPurchaseOrderItems(purchaseOrder.id, input.organizationId, input.items, tx);
    }
    return getPurchaseOrderById(purchaseOrder.id, input.organizationId, tx);
  });
}

export function listPurchaseOrders(input: ListPurchaseOrdersInput) {
  assert(input.organizationId, "organizationId");
  return listPurchaseOrdersForOrganization(input);
}

export function countPurchaseOrders(input: Pick<ListPurchaseOrdersInput, "organizationId" | "status" | "supplierId">) {
  assert(input.organizationId, "organizationId");
  return countPurchaseOrdersForOrganization(input);
}

export function getPurchaseOrderByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getPurchaseOrderById(id, organizationId);
}

export async function transitionPurchaseOrderStatus(input: TransitionPurchaseOrderStatusInput, outerTx?: Prisma.TransactionClient) {
  assert(input.purchaseOrderId, "purchaseOrderId");
  assert(input.organizationId, "organizationId");

  const exec = async (tx: Prisma.TransactionClient) => {
    const purchaseOrder = await tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, organizationId: input.organizationId } });
    if (!purchaseOrder) throw new ApiValidationError("PurchaseOrder not found.", 404);

    const allowed = ALLOWED_PURCHASE_ORDER_TRANSITIONS[purchaseOrder.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiValidationError(`Transition from ${purchaseOrder.status} to ${input.toStatus} is not permitted.`, 409);
    }

    try {
      await updatePurchaseOrderStatus(input.purchaseOrderId, input.organizationId, purchaseOrder.status, input.toStatus, {}, tx);
    } catch (error) {
      if (error instanceof PurchaseOrderConcurrentlyModifiedError) {
        throw new ApiValidationError("PurchaseOrder status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }

    return getPurchaseOrderById(input.purchaseOrderId, input.organizationId, tx);
  };

  return outerTx ? exec(outerTx) : prisma.$transaction(exec);
}

export async function cancelPurchaseOrder(input: CancelPurchaseOrderInput) {
  assert(input.purchaseOrderId, "purchaseOrderId");
  assert(input.organizationId, "organizationId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, organizationId: input.organizationId } });
    if (!purchaseOrder) throw new ApiValidationError("PurchaseOrder not found.", 404);

    const allowed = ALLOWED_PURCHASE_ORDER_TRANSITIONS[purchaseOrder.status];
    if (!allowed.includes("CANCELLED")) {
      throw new ApiValidationError(`PurchaseOrder in status ${purchaseOrder.status} cannot be cancelled.`, 409);
    }

    try {
      await updatePurchaseOrderStatus(input.purchaseOrderId, input.organizationId, purchaseOrder.status, "CANCELLED", { cancellationReason: input.reason }, tx);
    } catch (error) {
      if (error instanceof PurchaseOrderConcurrentlyModifiedError) {
        throw new ApiValidationError("PurchaseOrder status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }

    return getPurchaseOrderById(input.purchaseOrderId, input.organizationId, tx);
  });
}
