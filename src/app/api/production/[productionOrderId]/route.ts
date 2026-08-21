import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, optionalNumber, optionalStringEnum, ApiValidationError } from "@/lib/api/validation";
import { getProductionOrderByIdForOrganization, updateProductionOrderDetails } from "@/lib/core/production/production.service";

const STATUSES = ["DRAFT", "PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] as const;

export async function GET(_request: Request, context: { params: Promise<{ productionOrderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { productionOrderId } = await context.params;
    const productionOrder = await getProductionOrderByIdForOrganization(productionOrderId, auth.organization.id);
    return productionOrder ? ok({ productionOrder }) : fail("Production order not found.", 404);
  } catch (e) {
    return authFail(e);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ productionOrderId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { productionOrderId } = await context.params;
    const body = await readJsonObject(request);
    const productionOrder = await updateProductionOrderDetails({
      id: productionOrderId,
      organizationId: auth.organization.id,
      orderNumber: optionalString(body, "orderNumber"),
      status: optionalStringEnum(body, "status", STATUSES),
      statusChangeReason: optionalString(body, "statusChangeReason"),
      sourceOrderId: optionalString(body, "sourceOrderId"),
      productServiceId: optionalString(body, "productServiceId"),
      workCenterId: optionalString(body, "workCenterId"),
      quantityPlanned: optionalNumber(body, "quantityPlanned"),
      quantityProduced: optionalNumber(body, "quantityProduced"),
      plannedStartAt: optionalString(body, "plannedStartAt"),
      plannedEndAt: optionalString(body, "plannedEndAt"),
      actualStartAt: optionalString(body, "actualStartAt"),
      actualEndAt: optionalString(body, "actualEndAt"),
      notes: optionalString(body, "notes"),
    });
    return ok({ productionOrder });
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
