import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalBoolean,
  optionalJsonValue,
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
import type { CustomerWithPrimaryContact } from "@/lib/core/customers/customer.types";
import type { RequestBody } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { prisma } from "@/lib/core/shared/prisma";

function serializeCustomer(customer: CustomerWithPrimaryContact) {
  return {
    ...customer,
    balanceCents: customer.balanceCents.toString(),
  };
}

function readPrimaryContact(body: RequestBody) {
  const raw = body["primaryContact"];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiValidationError("primaryContact must be an object.");
  }

  const contact = raw as RequestBody;
  return {
    fullName: optionalString(contact, "fullName"),
    title: optionalString(contact, "title"),
    phone: optionalString(contact, "phone"),
    email: optionalString(contact, "email"),
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

    const [commercialTerms, customFieldValues] = await Promise.all([prisma.customerCommercialTerms.findFirst({ where: { customerId, organizationId: authContext.organization.id } }), prisma.customerCustomFieldValue.findMany({ where: { customerId, organizationId: authContext.organization.id }, include: { definition: true } })]);
    return ok({ customer: { ...serializeCustomer(customer), commercialTerms: commercialTerms ? { ...commercialTerms, creditLimitCents: commercialTerms.creditLimitCents?.toString() ?? null } : null, customFieldValues: customFieldValues.map((item) => ({ definitionId: item.definitionId, label: item.definition.label, value: item.valueJson })) } });
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
    const security = authorizeLegacyMutation({ authContext, actionName: "customer.update", requiredPermission: "customers.write", entityType: "Customer", entityId: customerId });
    const body = await readJsonObject(request);

    const healthScore = optionalNumber(body, "healthScore");
    if (healthScore !== undefined && (healthScore < 0 || healthScore > 100)) {
      return fail("healthScore must be between 0 and 100.", 400);
    }

    const existing = await getCustomerByIdForOrganization(customerId, authContext.organization.id);
    if (!existing) {
      return fail("Customer not found.", 404);
    }

    const updated = await updateCustomerDetails({
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
      cariKodu: optionalString(body, "cariKodu"),
      taxNumber: optionalString(body, "taxNumber"),
      taxOffice: optionalString(body, "taxOffice"),
      mersisNo: optionalString(body, "mersisNo"),
      tradeRegistryNo: optionalString(body, "tradeRegistryNo"),
      billingAddress: optionalJsonValue(body, "billingAddress") as Record<string, unknown> | undefined,
      shippingAddress: optionalJsonValue(body, "shippingAddress") as Record<string, unknown> | undefined,
      eInvoiceEnabled: optionalBoolean(body, "eInvoiceEnabled"),
      eArchiveEnabled: optionalBoolean(body, "eArchiveEnabled"),
      updatedByUserId: authContext.user.id,
      primaryContact: readPrimaryContact(body),
    });
    security.succeed();

    return ok({ customer: serializeCustomer(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
