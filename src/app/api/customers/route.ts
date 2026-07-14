import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalBoolean,
  optionalJsonValue,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewCustomer, listCustomers } from "@/lib/core/customers/customer.service";
import type { CustomerWithPrimaryContact } from "@/lib/core/customers/customer.types";
import type { CustomerStatus } from "@prisma/client";
import type { RequestBody } from "@/lib/api/validation";

const CUSTOMER_STATUSES = ["ACTIVE", "PASSIVE", "BLOCKED"] as const satisfies readonly CustomerStatus[];

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

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const rawStatus = new URL(request.url).searchParams.get("status") ?? undefined;

    if (rawStatus !== undefined && !(CUSTOMER_STATUSES as readonly string[]).includes(rawStatus)) {
      return fail("status is invalid.", 400);
    }

    const customers = await listCustomers({
      organizationId: authContext.organization.id,
      status: rawStatus as CustomerStatus | undefined,
    });

    return ok({ customers: customers.map(serializeCustomer), count: customers.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);

    const healthScore = optionalNumber(body, "healthScore");
    if (healthScore !== undefined && (healthScore < 0 || healthScore > 100)) {
      return fail("healthScore must be between 0 and 100.", 400);
    }

    const customer = await createNewCustomer({
      organizationId: authContext.organization.id,
      displayName: requiredString(body, "displayName"),
      legalName: optionalString(body, "legalName"),
      phone: optionalString(body, "phone"),
      email: optionalString(body, "email"),
      tier: optionalString(body, "tier"),
      healthScore,
      metrixNote: optionalString(body, "metrixNote"),
      cariKodu: optionalString(body, "cariKodu"),
      taxNumber: optionalString(body, "taxNumber"),
      taxOffice: optionalString(body, "taxOffice"),
      mersisNo: optionalString(body, "mersisNo"),
      tradeRegistryNo: optionalString(body, "tradeRegistryNo"),
      billingAddress: optionalJsonValue(body, "billingAddress") as Record<string, unknown> | undefined,
      shippingAddress: optionalJsonValue(body, "shippingAddress") as Record<string, unknown> | undefined,
      eInvoiceEnabled: optionalBoolean(body, "eInvoiceEnabled"),
      eArchiveEnabled: optionalBoolean(body, "eArchiveEnabled"),
      createdByUserId: authContext.user.id,
      primaryContact: readPrimaryContact(body),
    });

    return ok({ customer: serializeCustomer(customer) }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
