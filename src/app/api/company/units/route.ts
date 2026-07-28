import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createCompanyUnit } from "@/lib/company/company.service";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.unit.create", requiredPermission: "company.write", entityType: "CompanyUnit" });
    const body = await readJsonObject(request);
    if (typeof body.name !== "string" || !body.name.trim()) return fail("name is required.", 400);
    const unit = await createCompanyUnit(auth.organization.id, body);
    security.succeed(unit.id);
    return ok({ unit }, 201);
  } catch (error) {
    return authFail(error);
  }
}
