import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalNumber,
  optionalString,
  optionalStringEnum,
  readJsonObject,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  getCustomerByIdForOrganization,
  updateCustomerDetails,
} from "@/lib/core/customers/customer.service";
import type { CustomerResult } from "@/lib/core/customers/customer.types";

function serializeCustomer(customer: CustomerResult) {
  return {
    ...customer,
    balanceCents: customer.balanceCents.toString(),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;

    const customer = await getCustomerByIdForOrganization(customerId, authContext.organization.id);

    if (!customer) {
      return fail("Customer not found.", 404);
    }

    return ok({ customer: serializeCustomer(customer) });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const body = await readJsonObject(request);

    const healthScore = optionalNumber(body, "healthScore");
    if (healthScore !== undefined && (healthScore < 0 || healthScore > 100)) {
      return fail("healthScore must be between 0 and 100.", 400);
    }

    await updateCustomerDetails({
      id: customerId,
      organizationId: authContext.organization.id,
      displayName: optionalString(body, "displayName"),
      legalName: optionalString(body, "legalName"),
      phone: optionalString(body, "phone"),
      email: optionalString(body, "email"),
      tier: optionalString(body, "tier"),
      healthScore,
      metrixNote: optionalString(body, "metrixNote"),
      status: optionalStringEnum(body, "status", ["ACTIVE", "PASSIVE", "BLOCKED"]),
    });

    const updated = await getCustomerByIdForOrganization(customerId, authContext.organization.id);

    if (!updated) {
      return fail("Customer not found.", 404);
    }

    return ok({ customer: serializeCustomer(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
