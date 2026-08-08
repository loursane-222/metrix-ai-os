import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { getOrderByIdForOrganization, transitionOrderStatus, cancelOrder } from "@/lib/core/orders/order.service";
import { serializeOrder } from "@/lib/core/orders/order.serializer";
import type { OrderStatus } from "@prisma/client";

const ORDER_STATUS_VALUES: readonly OrderStatus[] = ["DRAFT","PENDING_APPROVAL","APPROVED","PLANNED","IN_PRODUCTION","ON_HOLD","READY","PARTIALLY_SHIPPED","SHIPPED","COMPLETED","CANCELLED"];

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { orderId } = await params;
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
