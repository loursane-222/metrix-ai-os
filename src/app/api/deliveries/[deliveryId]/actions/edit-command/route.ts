import { ok, fail } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { getDeliveryByIdForOrganization } from "@/lib/core/deliveries/delivery.service";
import { resolveDeliveryEditCommand } from "@/lib/deliveries/delivery-edit-command-resolver";
import { generateDeliveryEditCommandText } from "@/lib/deliveries/delivery-edit-command-ai-adapter";
export const maxDuration = 60;
const TRANSITIONS: Record<string, readonly string[]> = { DRAFT: ["PREPARING", "CANCELLED"], PREPARING: ["PICKING", "CANCELLED"], PICKING: ["PACKING", "CANCELLED"], PACKING: ["LOADED", "CANCELLED"], LOADED: ["DISPATCHED", "CANCELLED"], DISPATCHED: ["AT_DELIVERY_POINT", "FAILED_DELIVERY"], AT_DELIVERY_POINT: ["DELIVERED", "FAILED_DELIVERY"], DELIVERED: ["COMPLETED"], FAILED_DELIVERY: ["RESCHEDULED"], RESCHEDULED: ["DISPATCHED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
export async function POST(request: Request, context: { params: Promise<{ deliveryId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { deliveryId } = await context.params;
    const body = await readJsonObject(request); const utterance = requiredString(body, "utterance"); const activeTab = requiredString(body, "activeTab");
    const delivery = await getDeliveryByIdForOrganization(deliveryId, auth.organization.id); if (!delivery) return fail("Delivery not found.", 404);
    const outcome = await resolveDeliveryEditCommand({ utterance, activeTab, generateText: generateDeliveryEditCommandText, context: { deliveryNumber: delivery.deliveryNumber, status: delivery.status, allowedTransitions: TRANSITIONS[delivery.status] ?? [], items: delivery.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity.toString() })) } });
    return ok({ outcome });
  } catch (error: unknown) { return mapExecutionErrorToHttpResponse(error); }
}
