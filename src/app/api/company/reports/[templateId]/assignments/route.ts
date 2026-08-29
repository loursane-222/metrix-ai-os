import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createReportAssignment } from "@/lib/company/company-report.service";

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { templateId } = await context.params;
    const security = await authorizeLegacyMutation({ authContext: auth, actionName: "company.report.assignment.create", requiredPermission: "company.write", entityType: "ReportAssignment" });
    const body = await readJsonObject(request);
    if (typeof body.assigneeUserId !== "string") return fail("assigneeUserId is required.", 400);
    const dueDate = typeof body.dueDate === "string" ? new Date(body.dueDate) : undefined;
    if (dueDate && Number.isNaN(dueDate.getTime())) return fail("dueDate is invalid.", 400);
    const assignment = await createReportAssignment({ organizationId: auth.organization.id, templateId, assigneeUserId: body.assigneeUserId, managerUserId: typeof body.managerUserId === "string" ? body.managerUserId : auth.user.id, dueRule: body.dueRule, dueDate });
    await security.succeed(assignment.id);
    return ok({ assignment }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_ASSIGNEE_NOT_IN_ORGANIZATION") return fail("Assignee is not an active organization member.", 409);
    return authFail(error);
  }
}
