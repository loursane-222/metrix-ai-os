import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import { notifyCustomerAttachmentRecipient } from "@/lib/customers/customer-attachment-notification.service";
import { mapCustomerAttachmentError } from "@/lib/customers/customer-document-attachment.service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const security = authorizeLegacyMutation({ authContext: auth, actionName: "notification.create", requiredPermission: "notifications.write", entityType: "Notification" });
    const { attachmentRef } = await context.params;
    const body = await readJsonObject(request);
    const result = await notifyCustomerAttachmentRecipient({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef, target: requiredString(body, "target") });
    if (result.status === "NOT_COMMITTED") return fail("Belge bildirimi için önce müşteri kaydını tamamlayın.", 409);
    if (result.status === "DELIVERED") security.succeed(result.notification.id);
    return ok(result);
  } catch (error) {
    const mapped = mapCustomerAttachmentError(error);
    return mapped ? fail(mapped.message, mapped.status) : authFail(error);
  }
}
