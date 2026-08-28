import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { setCompanyUnitActive, updateCompanyUnit } from "@/lib/company/company.service";

export async function PATCH(request: Request, context: { params: Promise<{ unitId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { unitId } = await context.params;
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "company.unit.update", requiredPermission: "company.write", entityType: "CompanyUnit", entityId: unitId });
    const body = await readJsonObject(request);
    const unit = typeof body.active === "boolean" && Object.keys(body).length === 1
      ? await setCompanyUnitActive(auth.organization.id, unitId, body.active)
      : await updateCompanyUnit(auth.organization.id, unitId, body);
    await security.succeed(unit.id);
    return ok({ unit });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPANY_UNIT_NOT_FOUND") return fail("Company unit not found.", 404);
    if (error instanceof Error && error.message === "PRIMARY_COMPANY_UNIT_CANNOT_BE_DEACTIVATED") return fail("Primary birim değiştirilmeden pasifleştirilemez.", 409);
    return authFail(error);
  }
}
