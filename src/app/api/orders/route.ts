import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createNewOrder, listOrders } from "@/lib/core/orders/order.service";
import { serializeOrder } from "@/lib/core/orders/order.serializer";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const orders = await listOrders({ organizationId: auth.organization.id });
    return ok({ orders: orders.map((o) => serializeOrder(o)), count: orders.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const customerId = optionalString(body, "customerId");
    if (!customerId) return fail("customerId is required.", 400);
    const order = await createNewOrder({
      organizationId: auth.organization.id,
      customerId,
      currency: optionalString(body, "currency"),
      notes: optionalString(body, "notes"),
    });
    return ok({ order: serializeOrder(order) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
