import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createDeliveryFromOrder } from "@/lib/core/deliveries/delivery.service";
import { serializeDelivery } from "@/lib/core/deliveries/delivery.serializer";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const orderId = optionalString(body, "orderId");
    if (!orderId) return fail("orderId is required.", 400);
    const autoDispatch = body["autoDispatch"] === true;
    const delivery = await createDeliveryFromOrder({
      organizationId: auth.organization.id,
      sourceOrderId: orderId,
      autoDispatch,
    });
    return ok({ delivery: serializeDelivery(delivery) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
