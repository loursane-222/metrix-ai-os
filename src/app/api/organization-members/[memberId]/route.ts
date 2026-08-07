import { OrganizationRole } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalBoolean, optionalStringEnum, readJsonObject } from "@/lib/api/validation";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { manageOrganizationMember } from "@/lib/core/organization-members/organization-member.service";

const ROLES = Object.values(OrganizationRole);

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { memberId } = await context.params;
    const security = authorizeLegacyMutation({ authContext, actionName: "organization_member.update", requiredPermission: "members.manage", entityType: "OrganizationMember", entityId: memberId });
    const body = await readJsonObject(request);
    const role = optionalStringEnum(body, "role", ROLES);
    const disabled = optionalBoolean(body, "disabled");
    if (role === undefined && disabled === undefined) throw new ApiValidationError("role veya disabled alanı gereklidir.");
    const member = await manageOrganizationMember({ organizationId: authContext.organization.id, memberId, actorMemberId: authContext.membership.id, role, disabled });
    security.succeed(member.id);
    return ok({ member });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
