import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { getOrderByIdForOrganization, transitionOrderStatus, cancelOrder } from "@/lib/core/orders/order.service";
import { serializeOrder } from "@/lib/core/orders/order.serializer";
import type { OrderStatus } from "@prisma/client";
import { refreshOrderIntelligence } from "@/lib/core/orders/order-intelligence.service";
import { recordOrderException, recordOrderRevision } from "@/lib/core/orders/order-intelligence.service";
import type { OrderExceptionCategory } from "@prisma/client";

const ORDER_STATUS_VALUES: readonly OrderStatus[] = ["DRAFT","PENDING_APPROVAL","APPROVED","PLANNED","IN_PRODUCTION","ON_HOLD","READY","PARTIALLY_SHIPPED","SHIPPED","COMPLETED","CANCELLED"];
const EXCEPTION_VALUES: readonly OrderExceptionCategory[] = ["CUSTOMER_HOLD_REQUEST","PRODUCTION_STOPPED","QUALITY_ISSUE","SUPPLY_DELAY","PAYMENT_HOLD","SHIPMENT_DELAYED","CUSTOMER_ADDRESS_CHANGED","OTHER"];

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { orderId } = await params;
    await refreshOrderIntelligence(orderId, auth.organization.id);
    const order = await getOrderByIdForOrganization(orderId, auth.organization.id);
    if (!order) return fail("Order not found.", 404);
    return ok({ order: serializeOrder(order) });
  } catch (e) {
    return authFail(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { orderId } = await params;
    const body = await readJsonObject(request);
    const action = optionalString(body, "action");

    if (action === "revise") {
      const changeType = optionalString(body, "changeType");
      let change;
      if (changeType === "QUANTITY_CHANGED") {
        const quantity = Number(body.quantity);
        const orderItemId = optionalString(body, "orderItemId");
        if (!orderItemId || !Number.isFinite(quantity)) return fail("orderItemId and quantity are required.", 400);
        change = { changeType, orderItemId, quantity } as const;
      } else if (changeType === "DEADLINE_CHANGED") {
        const raw = body.deadlineAt;
        const deadlineAt = raw === null ? null : typeof raw === "string" ? new Date(raw) : null;
        if (raw !== null && (!deadlineAt || Number.isNaN(deadlineAt.valueOf()))) return fail("deadlineAt must be a valid date or null.", 400);
        change = { changeType, deadlineAt } as const;
      } else if (changeType === "ITEM_REMOVED") {
        const orderItemId = optionalString(body, "orderItemId");
        if (!orderItemId) return fail("orderItemId is required.", 400);
        change = { changeType, orderItemId } as const;
      } else {
        return fail("Unsupported revision changeType.", 400);
      }
      const revision = await recordOrderRevision(orderId, auth.organization.id, change, optionalString(body, "reason"), auth.user.id);
      return ok({ revision });
    }

    if (action === "exception") {
      const category = optionalString(body, "category");
      if (!category || !EXCEPTION_VALUES.includes(category as OrderExceptionCategory)) return fail("A valid exception category is required.", 400);
      const exception = await recordOrderException(orderId, auth.organization.id, category as OrderExceptionCategory, optionalString(body, "note"), auth.user.id);
      return ok({ exception });
    }

    if (action === "cancel") {
      const reason = optionalString(body, "reason");
      if (!reason) return fail("reason is required for cancel.", 400);
      const order = await cancelOrder({ orderId, organizationId: auth.organization.id, reason });
      return ok({ order: serializeOrder(order) });
    }

    const toStatus = optionalString(body, "toStatus");
    if (!toStatus || !ORDER_STATUS_VALUES.includes(toStatus as OrderStatus)) return fail("toStatus is required and must be a valid status.", 400);
    const order = await transitionOrderStatus({
      orderId,
      organizationId: auth.organization.id,
      toStatus: toStatus as OrderStatus,
      reason: optionalString(body, "reason"),
    });
    return ok({ order: serializeOrder(order) });
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
