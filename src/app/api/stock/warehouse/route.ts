import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, ApiValidationError } from "@/lib/api/validation";
import { createNewWarehouse, listWarehousesForOrganization } from "@/lib/core/stock/stock.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const warehouses = await listWarehousesForOrganization(auth.organization.id);
    return ok({ warehouses, count: warehouses.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const name = optionalString(body, "name");
    const code = optionalString(body, "code");
    if (!name) return fail("name is required.", 400);
    if (!code) return fail("code is required.", 400);

    const warehouse = await createNewWarehouse({
      organizationId: auth.organization.id,
      name,
      code,
      type: optionalString(body, "type"),
      address: optionalString(body, "address"),
      notes: optionalString(body, "notes"),
    });
    return ok({ warehouse }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
