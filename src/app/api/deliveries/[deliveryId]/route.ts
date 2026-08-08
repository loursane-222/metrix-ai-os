import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { getDeliveryByIdForOrganization, transitionDeliveryStatus, cancelDelivery } from "@/lib/core/deliveries/delivery.service";
import { serializeDelivery } from "@/lib/core/deliveries/delivery.serializer";
import type { DeliveryStatus } from "@prisma/client";

const DELIVERY_STATUS_VALUES: readonly DeliveryStatus[] = [
  "DRAFT", "PREPARING", "PICKING", "PACKING", "LOADED", "DISPATCHED",
  "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED", "CANCELLED",
];

export async function GET(_req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { deliveryId } = await params;
    const delivery = await getDeliveryByIdForOrganization(deliveryId, auth.organization.id);
    if (!delivery) return fail("Delivery not found.", 404);
    return ok({ delivery: serializeDelivery(delivery) });
  } catch (e) {
    return authFail(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { deliveryId } = await params;
    const body = await readJsonObject(request);
    const action = optionalString(body, "action");

    if (action === "cancel") {
      const reason = optionalString(body, "reason");
      if (!reason) return fail("reason is required for cancel.", 400);
      const delivery = await cancelDelivery({ deliveryId, organizationId: auth.organization.id, reason });
      return ok({ delivery: serializeDelivery(delivery) });
    }

    const toStatus = optionalString(body, "toStatus");
    if (!toStatus || !DELIVERY_STATUS_VALUES.includes(toStatus as DeliveryStatus)) {
      return fail("toStatus is required and must be a valid status.", 400);
    }
    const delivery = await transitionDeliveryStatus({
      deliveryId,
      organizationId: auth.organization.id,
      toStatus: toStatus as DeliveryStatus,
      reason: optionalString(body, "reason"),
    });
    return ok({ delivery: serializeDelivery(delivery) });
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
