import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getCompanyOverview, updateCompanyProfile } from "@/lib/company/company.service";
import { buildCanonicalCompanyModelV2 } from "@/lib/company/company-model-projection.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const [overview, companyModel] = await Promise.all([
      getCompanyOverview(auth.organization.id),
      buildCanonicalCompanyModelV2(auth.organization.id),
    ]);
    return ok({ ...overview, companyModel });
  } catch (error) {
    return authFail(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.profile.update", requiredPermission: "company.write", entityType: "CompanyProfile" });
    const body = await readJsonObject(request);
    const official = ["taxOffice", "taxNumber", "mersisNo", "tradeRegistryNo", "chamberRegistration", "kepAddress", "eInvoiceEnabled", "eArchiveEnabled"];
    if (official.some((key) => body[key] !== undefined)) return fail("Resmî alan değişiklikleri Business Candidate ve açık onay gerektirir.", 409);
    const profile = await updateCompanyProfile(auth.organization.id, auth.user.id, body);
    security.succeed(profile.id);
    return ok({ profile });
  } catch (error) {
    return authFail(error);
  }
}
