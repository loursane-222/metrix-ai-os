import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, requiredNumber, ApiValidationError } from "@/lib/api/validation";
import { createNewProductionOrder, listProductionOrders } from "@/lib/core/production/production.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const productionOrders = await listProductionOrders({ organizationId: auth.organization.id });
    return ok({ productions: productionOrders, count: productionOrders.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const productionOrder = await createNewProductionOrder({
      organizationId: auth.organization.id,
      orderNumber: optionalString(body, "orderNumber") ?? "",
      sourceOrderId: optionalString(body, "sourceOrderId"),
      productServiceId: optionalString(body, "productServiceId"),
      workCenterId: optionalString(body, "workCenterId"),
      quantityPlanned: requiredNumber(body, "quantityPlanned"),
      plannedStartAt: optionalString(body, "plannedStartAt"),
      plannedEndAt: optionalString(body, "plannedEndAt"),
      notes: optionalString(body, "notes"),
    });
    return ok({ productionOrder }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
