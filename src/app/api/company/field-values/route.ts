import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ values: await prisma.companyDynamicFieldValue.findMany({ where: { organizationId: auth.organization.id }, include: { definition: true } }) });
  } catch (error) {
    return authFail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "company.field.value.write", requiredPermission: "company.write", entityType: "CompanyDynamicFieldValue" });
    const body = await readJsonObject(request);
    const definitionId = typeof body.definitionId === "string" ? body.definitionId : "";
    if (!definitionId || body.value === undefined) return fail("definitionId and value are required.", 400);
    const definition = await prisma.customFieldDefinition.findFirst({ where: { id: definitionId, organizationId: auth.organization.id, module: "company", entityType: "company", active: true, writable: true } });
    if (!definition) return fail("Company field definition not found.", 404);
    if (definition.approvalPolicy === "EXPLICIT" || definition.riskLevel === "HIGH") return fail("Bu alan Business Candidate ve açık onay üzerinden güncellenmelidir.", 409);
    const companyUnitId = typeof body.companyUnitId === "string" ? body.companyUnitId : null;
    if (companyUnitId && !await prisma.companyUnit.findFirst({ where: { id: companyUnitId, organizationId: auth.organization.id } })) return fail("Company unit not found.", 404);
    const existing = await prisma.companyDynamicFieldValue.findFirst({ where: { organizationId: auth.organization.id, companyUnitId, definitionId } });
    const value = existing
      ? await prisma.companyDynamicFieldValue.update({ where: { id: existing.id, organizationId: auth.organization.id }, data: { valueJson: body.value as Prisma.InputJsonValue, provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" }, verificationStatus: "VERIFIED" } })
      : await prisma.companyDynamicFieldValue.create({ data: { organizationId: auth.organization.id, companyUnitId, definitionId, valueJson: body.value as Prisma.InputJsonValue, provenanceJson: { actorUserId: auth.user.id, channel: "company_ui" } } });
    await security.succeed(value.id);
    return ok({ value });
  } catch (error) {
    return authFail(error);
  }
}
