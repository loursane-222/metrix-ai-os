import { getCustomerByIdForOrganization } from "@/lib/core/customers/customer.service";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { resolveNotificationRecipient } from "@/lib/core/notifications/notification-recipient-resolver";
import { notify } from "@/lib/core/notifications/notification.service";
import { findUserRecordById } from "@/lib/core/users/user.repository";

export type CustomerCreatedNotificationTargetResult =
  | Readonly<{ status: "DELIVERED"; recipientName: string }>
  | Readonly<{ status: "CLARIFICATION_REQUIRED"; candidates: string[] }>
  | Readonly<{ status: "NOT_FOUND"; reason: string }>;

export async function notifyCreatedCustomerTarget(input: {
  organizationId: string;
  actorUserId: string;
  customerId: string;
  target: string;
}): Promise<CustomerCreatedNotificationTargetResult> {
  const [customer, members, actor] = await Promise.all([
    getCustomerByIdForOrganization(input.customerId, input.organizationId),
    listActiveNotificationRecipientRecords(input.organizationId),
    findUserRecordById(input.actorUserId),
  ]);
  if (!customer) return { status: "NOT_FOUND", reason: "CUSTOMER_NOT_FOUND" };

  const resolution = resolveNotificationRecipient(input.target, members);
  if (resolution.status === "AMBIGUOUS") {
    return { status: "CLARIFICATION_REQUIRED", candidates: resolution.candidates.map((candidate) => candidate.fullName).filter((name): name is string => Boolean(name)) };
  }
  if (resolution.status === "UNRESOLVED") return { status: "NOT_FOUND", reason: resolution.reason };

  await notify({
    organizationId: input.organizationId,
    recipientUserId: resolution.recipient.userId,
    type: "customer.created",
    title: `${actor?.fullName?.trim() || "Bir ekip üyesi"} · Yeni müşteri kaydı açıldı`,
    body: customer.displayName,
    entityType: "Customer",
    entityId: customer.id,
  });
  return { status: "DELIVERED", recipientName: resolution.recipient.fullName ?? input.target };
}
