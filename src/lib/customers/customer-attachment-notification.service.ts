import { notify } from "@/lib/core/notifications";
import { resolveNotificationRecipient } from "@/lib/core/notifications/notification-recipient-resolver";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { resolveCustomerAttachment } from "./customer-document-attachment.service";

export async function notifyCustomerAttachmentRecipient(input: { organizationId: string; actorId: string; attachmentRef: string; target: string }) {
  const attachment = await resolveCustomerAttachment(input);
  if (!attachment.committedCustomerId) return { status: "NOT_COMMITTED" as const };
  const resolution = resolveNotificationRecipient(input.target, await listActiveNotificationRecipientRecords(input.organizationId));
  if (resolution.status === "AMBIGUOUS") return { status: "CLARIFICATION_REQUIRED" as const, candidates: resolution.candidates.map((candidate) => candidate.fullName!).slice(0, 5) };
  if (resolution.status === "UNRESOLVED") return { status: "CLARIFICATION_REQUIRED" as const, candidates: [] as string[], reason: resolution.reason };
  const notification = await notify({
    organizationId: input.organizationId,
    recipientUserId: resolution.recipient.userId,
    type: "customer.document.added",
    title: "Müşteriye yeni bir belge eklendi",
    body: "İlgili müşteri kaydını kendi erişim yetkiniz kapsamında inceleyebilirsiniz.",
    severity: "INFO",
    entityType: "Customer",
    entityId: attachment.committedCustomerId,
  });
  return { status: "DELIVERED" as const, notification, recipientName: resolution.recipient.fullName! };
}
