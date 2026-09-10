import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";

// Read-only, auth-only (no members.manage gate): any active org member may
// need to see who a task/reminder can be assigned to. Backed by the same
// canonical active-member list the assignee/notification-target resolvers
// already use server-side (member-name-resolution.ts) — not a second
// membership source.
export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const members = await listActiveNotificationRecipientRecords(authContext.organization.id);
    return ok({
      members: members
        .filter((member) => member.fullName)
        .map((member) => ({ userId: member.userId, fullName: member.fullName as string })),
    });
  } catch (error) {
    return authFail(error);
  }
}
