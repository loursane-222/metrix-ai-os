import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createReportTemplateVersion } from "@/lib/company/company-report.service";

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { templateId } = await context.params;
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.report.template.version", requiredPermission: "company.write", entityType: "ReportTemplate", entityId: templateId });
    const body = await readJsonObject(request);
    if (!body.fixedCore || typeof body.rationale !== "string") return fail("fixedCore and rationale are required.", 400);
    const version = await createReportTemplateVersion({ organizationId: auth.organization.id, templateId, fixedCore: body.fixedCore, focusedSection: body.focusedSection, dynamicQuestions: body.dynamicQuestions, rationale: body.rationale });
    security.succeed(templateId);
    return ok({ version }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_TEMPLATE_NOT_FOUND") return fail("Report template not found.", 404);
    return authFail(error);
  }
}
