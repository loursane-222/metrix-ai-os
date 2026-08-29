import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createOrderFromQuote } from "@/lib/core/orders/order.service";
import { serializeOrder } from "@/lib/core/orders/order.serializer";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const quoteId = optionalString(body, "quoteId");
    if (!quoteId) return fail("quoteId is required.", 400);
    const order = await createOrderFromQuote({ organizationId: auth.organization.id, quoteId, performedById: auth.user.id });
    return ok({ order: serializeOrder(order) }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
