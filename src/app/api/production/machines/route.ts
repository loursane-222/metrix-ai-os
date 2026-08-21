import { ok, fail } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { readJsonObject, optionalString, requiredString, ApiValidationError } from "@/lib/api/validation";
import { createNewMachine, listMachines } from "@/lib/core/production/production.service";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const workCenterId = new URL(request.url).searchParams.get("workCenterId") ?? undefined;
    const machines = await listMachines({ organizationId: auth.organization.id, workCenterId });
    return ok({ machines, count: machines.length });
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const machine = await createNewMachine({
      organizationId: auth.organization.id,
      workCenterId: requiredString(body, "workCenterId"),
      name: optionalString(body, "name") ?? "",
      code: optionalString(body, "code") ?? "",
      notes: optionalString(body, "notes"),
    });
    return ok({ machine }, 201);
  } catch (e) {
    if (e instanceof ApiValidationError) return fail(e.message, 400);
    return authFail(e);
  }
}
