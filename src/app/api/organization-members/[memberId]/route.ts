import { randomUUID } from "crypto";
import { OrganizationRole } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalBoolean, optionalStringEnum, readJsonObject } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listOrganizationMembers } from "@/lib/core/organization-members/organization-member.service";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

const ROLES = Object.values(OrganizationRole);

/**
 * Bu route eskiden authorizeLegacyMutation + manageOrganizationMember'ı
 * doğrudan çağırıyordu — organization_member.update Action Registry'de
 * kayıtlı olsa da (bkz. team.actions.ts) bu route ondan tamamen bağımsız,
 * ikinci bir mutation yoluydu. team.update capability'si artık aynı
 * organization_member.update aksiyonuna, Universal Capability Runtime
 * üzerinden bağlanır — ikinci bir yetki/mutation yolu kalmaz.
 */
export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { memberId } = await context.params;
    const body = await readJsonObject(request);
    const role = optionalStringEnum(body, "role", ROLES);
    const disabled = optionalBoolean(body, "disabled");
    if (role === undefined && disabled === undefined) throw new ApiValidationError("role veya disabled alanı gereklidir.");

    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "UPDATE",
        domain: "team",
        entity: { entityType: "organization_member", entityId: memberId },
        capability: "team.update",
        payload: { memberId, role, disabled },
        revealIntent: { explicit: false },
      },
      { authContext },
    );
    if (result.status !== "EXECUTED") return canonicalOperationResultToHttpResponse(result, "organization_member.update");

    const members = await listOrganizationMembers(authContext.organization.id);
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) return fail("Member not found after execution.", 500);
    return ok({ member });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
