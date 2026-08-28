import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { countCustomers, listCustomers } from "@/lib/core/customers/customer.service";
import type { CustomerWithPrimaryContact } from "@/lib/core/customers/customer.types";
import type { CustomerStatus } from "@prisma/client";
import { filterCustomerRecordForRole } from "@/lib/customers/customer-field-visibility";

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

    const listInput = {
      organizationId: authContext.organization.id,
      status: (rawStatus ?? "ACTIVE") as CustomerStatus,
    };
    const [customers, totalCount] = await Promise.all([
      listCustomers(listInput),
      countCustomers(listInput),
    ]);

    return ok({ customers: customers.map((customer) => filterCustomerRecordForRole(serializeCustomer(customer), authContext.membership.role)), count: totalCount });
  } catch (error: unknown) {
    return authFail(error);
  }
}
