import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createNewDelivery, listDeliveries } from "@/lib/core/deliveries/delivery.service";
import { serializeDelivery } from "@/lib/core/deliveries/delivery.serializer";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const deliveries = await listDeliveries({ organizationId: auth.organization.id });
    return ok({ deliveries: deliveries.map((d) => serializeDelivery(d)), count: deliveries.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const sourceOrderId = optionalString(body, "sourceOrderId");
    const customerId = optionalString(body, "customerId");
    if (!sourceOrderId) return fail("sourceOrderId is required.", 400);
    if (!customerId) return fail("customerId is required.", 400);
    const delivery = await createNewDelivery({
      organizationId: auth.organization.id,
      sourceOrderId,
      customerId,
      warehouse: optionalString(body, "warehouse"),
      dispatchPoint: optionalString(body, "dispatchPoint"),
      deliveryAddress: optionalString(body, "deliveryAddress"),
      carrier: optionalString(body, "carrier"),
      notes: optionalString(body, "notes"),
      items: [],
    });
    return ok({ delivery: serializeDelivery(delivery) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
