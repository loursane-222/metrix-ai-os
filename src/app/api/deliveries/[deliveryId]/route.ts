import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { getDeliveryByIdForOrganization, transitionDeliveryStatus, cancelDelivery } from "@/lib/core/deliveries/delivery.service";
import { serializeDelivery } from "@/lib/core/deliveries/delivery.serializer";
import type { DeliveryExceptionCategory, DeliveryItemCondition, DeliveryStatus } from "@prisma/client";
import { recordDeliveryException, recordProofOfDelivery, refreshDeliveryIntelligence } from "@/lib/core/deliveries/delivery-intelligence.service";
import { prisma } from "@/lib/core/shared/prisma";

const DELIVERY_STATUS_VALUES: readonly DeliveryStatus[] = [
  "DRAFT", "PREPARING", "PICKING", "PACKING", "LOADED", "DISPATCHED",
  "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED", "CANCELLED",
];
const EXCEPTION_VALUES: readonly DeliveryExceptionCategory[] = ["CUSTOMER_NOT_AT_ADDRESS", "DELIVERY_REFUSED", "PRODUCT_DAMAGED", "VEHICLE_BREAKDOWN", "WRONG_ADDRESS", "SHORTAGE_FOUND", "DELIVERY_POSTPONED", "OTHER"];
const CONDITION_VALUES: readonly DeliveryItemCondition[] = ["OK", "SHORT", "DAMAGED", "WRONG_ITEM", "MIXED"];

export async function GET(_req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { deliveryId } = await params;
    await refreshDeliveryIntelligence(deliveryId, auth.organization.id);
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

    if (action === "proof") {
      await recordProofOfDelivery(deliveryId, auth.organization.id, {
        confirmationCode: optionalString(body, "confirmationCode"),
        receiverName: optionalString(body, "receiverName"),
        signatureCaptured: typeof body.signatureCaptured === "boolean" ? body.signatureCaptured : undefined,
        note: optionalString(body, "note"),
      });
      const delivery = await getDeliveryByIdForOrganization(deliveryId, auth.organization.id);
      return ok({ delivery: serializeDelivery(delivery) });
    }

    if (action === "exception") {
      const category = optionalString(body, "category");
      if (!category || !EXCEPTION_VALUES.includes(category as DeliveryExceptionCategory)) return fail("A valid delivery exception category is required.", 400);
      const exception = await recordDeliveryException(deliveryId, auth.organization.id, category as DeliveryExceptionCategory, optionalString(body, "note"), auth.user.id);
      return ok({ exception });
    }

    if (action === "item-condition") {
      const deliveryItemId = optionalString(body, "deliveryItemId");
      const conditionFlag = optionalString(body, "conditionFlag");
      if (!deliveryItemId || !conditionFlag || !CONDITION_VALUES.includes(conditionFlag as DeliveryItemCondition)) return fail("deliveryItemId and a valid conditionFlag are required.", 400);
      const updated = await prisma.deliveryItem.updateMany({ where: { id: deliveryItemId, deliveryId, organizationId: auth.organization.id }, data: { conditionFlag: conditionFlag as DeliveryItemCondition } });
      if (!updated.count) return fail("Delivery item not found.", 404);
      await refreshDeliveryIntelligence(deliveryId, auth.organization.id);
      return ok({ updated: true });
    }

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
