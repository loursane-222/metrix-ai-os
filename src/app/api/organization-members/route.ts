import { OrganizationRole } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, readJsonObject, requiredString, requiredStringEnum } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { inviteOrganizationMember, listOrganizationMembers } from "@/lib/core/organization-members/organization-member.service";

const ROLES = Object.values(OrganizationRole);

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    await authorizeLegacyMutation({ authContext, actionName: "organization_member.list", requiredPermission: "members.manage", entityType: "OrganizationMember" });
    return ok({ members: await listOrganizationMembers(authContext.organization.id) });
  } catch (error) { return authFail(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const security = await authorizeLegacyMutation({ authContext, actionName: "organization_member.invite", requiredPermission: "members.manage", entityType: "OrganizationMember" });
    const body = await readJsonObject(request);
    const member = await inviteOrganizationMember({
      organizationId: authContext.organization.id,
      email: requiredString(body, "email"),
      role: requiredStringEnum(body, "role", ROLES),
    });
    await security.succeed(member.id);
    return ok({ member }, 201);
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
