import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { assetId } = await context.params;
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.asset.update", requiredPermission: "company.write", entityType: "CompanyAsset", entityId: assetId });
    const body = await readJsonObject(request);
    const existing = await prisma.companyAsset.findFirst({ where: { id: assetId, organizationId: auth.organization.id } });
    if (!existing) return fail("Asset not found.", 404);
    const allowed = ["assetType", "name", "description", "acquisitionDate", "acquisitionValue", "currentBookValue", "estimatedCurrentValue", "currency", "companyUnitId", "status"] as const;
    const data = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    const asset = await prisma.companyAsset.update({ where: { id: existing.id }, data: { ...data, provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" } } });
    security.succeed(asset.id);
    return ok({ asset });
  } catch (error) {
    return authFail(error);
  }
}
