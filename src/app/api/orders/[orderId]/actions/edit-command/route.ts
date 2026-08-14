import { ok, fail } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { getOrderByIdForOrganization } from "@/lib/core/orders/order.service";
import { resolveOrderEditCommand } from "@/lib/orders/order-edit-command-resolver";
import { generateOrderEditCommandText } from "@/lib/orders/order-edit-command-ai-adapter";

export const maxDuration = 60;
const TRANSITIONS: Record<string, readonly string[]> = { DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"], PENDING_APPROVAL: ["APPROVED", "CANCELLED"], APPROVED: ["PLANNED", "CANCELLED"], PLANNED: ["IN_PRODUCTION", "ON_HOLD", "CANCELLED"], IN_PRODUCTION: ["READY", "ON_HOLD", "CANCELLED"], ON_HOLD: ["PLANNED"], READY: ["PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED"], PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"], SHIPPED: ["COMPLETED"], COMPLETED: [], CANCELLED: [] };

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { orderId } = await context.params;
    const body = await readJsonObject(request); const utterance = requiredString(body, "utterance"); const activeTab = requiredString(body, "activeTab");
    const order = await getOrderByIdForOrganization(orderId, auth.organization.id); if (!order) return fail("Order not found.", 404);
    const outcome = await resolveOrderEditCommand({ utterance, activeTab, generateText: generateOrderEditCommandText, context: { orderNumber: order.orderNumber, status: order.status, allowedTransitions: TRANSITIONS[order.status] ?? [], deadlineAt: order.deadlineAt?.toISOString() ?? null, items: order.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity.toString() })) } });
    return ok({ outcome });
  } catch (error: unknown) { return mapExecutionErrorToHttpResponse(error); }
}
