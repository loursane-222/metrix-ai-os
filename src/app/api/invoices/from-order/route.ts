import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createInvoiceFromOrder } from "@/lib/core/invoices/invoice.service";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const orderId = optionalString(body, "orderId");
    if (!orderId) return fail("orderId is required.", 400);
    const deliveryId = optionalString(body, "deliveryId");
    const notes = optionalString(body, "notes");
    const invoice = await createInvoiceFromOrder({
      organizationId: auth.organization.id,
      sourceOrderId: orderId,
      sourceDeliveryId: deliveryId,
      notes,
    });
    return ok({ invoice }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, e.status);
    return authFail(e);
  }
}
