import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createWeeklyReportTemplate, getReportManagementOverview } from "@/lib/company/company-report.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok(await getReportManagementOverview(auth.organization.id));
  } catch (error) { return authFail(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "company.report.template.create", requiredPermission: "company.write", entityType: "ReportTemplate" });
    const body = await readJsonObject(request);
    if (typeof body.name !== "string" || !body.name.trim()) return fail("name is required.", 400);
    const template = await createWeeklyReportTemplate({
      organizationId: auth.organization.id,
      name: body.name.trim(),
      fixedCore: body.fixedCore,
      focusedSection: body.focusedSection,
      dynamicQuestions: body.dynamicQuestions,
      rationale: typeof body.rationale === "string" ? body.rationale : "Yönetici tarafından oluşturuldu.",
    });
    security.succeed(template.id);
    return ok({ template }, 201);
  } catch (error) { return authFail(error); }
}
