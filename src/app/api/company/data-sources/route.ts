import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ dataSources: await prisma.companyDataSource.findMany({ where: { organizationId: auth.organization.id }, orderBy: { priority: "asc" } }) });
  } catch (error) { return authFail(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.data_source.upsert", requiredPermission: "integrations.write", entityType: "CompanyDataSource" });
    const body = await readJsonObject(request);
    if (typeof body.provider !== "string" || typeof body.sourceType !== "string") return fail("provider and sourceType are required.", 400);
    const row = await prisma.companyDataSource.upsert({
      where: { organizationId_provider_sourceType: { organizationId: auth.organization.id, provider: body.provider, sourceType: body.sourceType } },
      create: { organizationId: auth.organization.id, provider: body.provider, sourceType: body.sourceType, connectionStatus: typeof body.connectionStatus === "string" ? body.connectionStatus : "PENDING", readDataTypesJson: body.readDataTypes as Prisma.InputJsonValue | undefined, provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" } },
      update: { connectionStatus: typeof body.connectionStatus === "string" ? body.connectionStatus : undefined, readDataTypesJson: body.readDataTypes as Prisma.InputJsonValue | undefined, errorStatus: typeof body.errorStatus === "string" ? body.errorStatus : undefined, provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" } },
    });
    security.succeed(row.id);
    return ok({ dataSource: row });
  } catch (error) { return authFail(error); }
}
