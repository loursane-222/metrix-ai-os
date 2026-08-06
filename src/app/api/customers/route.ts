import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listCustomers } from "@/lib/core/customers/customer.service";
import type { CustomerWithPrimaryContact } from "@/lib/core/customers/customer.types";
import type { CustomerStatus } from "@prisma/client";

const CUSTOMER_STATUSES = ["ACTIVE", "PASSIVE", "BLOCKED"] as const satisfies readonly CustomerStatus[];

function serializeCustomer(customer: CustomerWithPrimaryContact) {
  return {
    ...customer,
    balanceCents: customer.balanceCents.toString(),
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
      status: (rawStatus ?? "ACTIVE") as CustomerStatus,
    });

    return ok({ customers: customers.map(serializeCustomer), count: customers.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}
