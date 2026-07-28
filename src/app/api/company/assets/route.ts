import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ assets: await prisma.companyAsset.findMany({ where: { organizationId: auth.organization.id }, orderBy: { updatedAt: "desc" } }) });
  } catch (error) {
    return authFail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.asset.create", requiredPermission: "company.write", entityType: "CompanyAsset" });
    const body = await readJsonObject(request);
    if (typeof body.name !== "string" || typeof body.assetType !== "string") return fail("name and assetType are required.", 400);
    const asset = await prisma.companyAsset.create({ data: {
      organizationId: auth.organization.id, name: body.name, assetType: body.assetType,
      description: typeof body.description === "string" ? body.description : undefined,
      currency: typeof body.currency === "string" ? body.currency : "TRY",
      companyUnitId: typeof body.companyUnitId === "string" ? body.companyUnitId : undefined,
      provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" },
    } });
    security.succeed(asset.id);
    return ok({ asset }, 201);
  } catch (error) {
    return authFail(error);
  }
}
