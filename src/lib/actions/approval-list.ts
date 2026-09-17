import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

const MAX_RESULTS = 50;

export type ApprovalListItem = {
  id: string;
  requestedById: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export async function listApprovalsForOrganization(input: {
  actorUserId: string;
  organizationId: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "EXECUTED";
  requestedById?: string;
}): Promise<ApprovalListItem[]> {
  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const approvals = await db.approvalRequest.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.requestedById ? { requestedById: input.requestedById } : {})
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS
  });

  return approvals.map(approval => ({
    id: approval.id,
    requestedById: approval.requestedById,
    actionType: approval.actionType,
    payload: JSON.parse(approval.payload),
    status: approval.status,
    expiresAt: approval.expiresAt?.toISOString() ?? null,
    resolvedAt: approval.resolvedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString()
  }));
}
