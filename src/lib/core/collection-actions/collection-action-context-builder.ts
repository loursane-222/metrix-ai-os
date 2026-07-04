import { listActiveCollectionActionsForOrganization } from "./collection-action.repository";
import { listRecentEventsForActions } from "./collection-action-event.repository";
import type { CollectionActionStatus, CollectionActionType } from "./collection-action.types";
import type { CollectionActionEventSummary } from "./collection-action-event.types";

export type CollectionActionContextItem = {
  id: string;
  paymentTitle: string;
  customerName: string;
  actionType: CollectionActionType;
  status: CollectionActionStatus;
  title: string;
  aiReason: string | null;
  daysOpen: number;
  priority: number;
  events: CollectionActionEventSummary[];
};

export type CollectionActionContext = {
  openCount: number;
  inProgressCount: number;
  items: CollectionActionContextItem[];
};

export async function buildCollectionActionContextForOrganization(
  organizationId: string,
): Promise<CollectionActionContext> {
  const now = new Date();
  const rows = await listActiveCollectionActionsForOrganization(organizationId);

  let openCount = 0;
  let inProgressCount = 0;

  const actionIds = rows.map((row) => row.id);
  const eventsMap = await listRecentEventsForActions(actionIds);

  const items: CollectionActionContextItem[] = rows.map((row) => {
    const daysOpen = Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 86400000));
    const customerName = row.payment.person?.fullName ?? row.payment.title;

    if (row.status === "OPEN") openCount++;
    else if (row.status === "IN_PROGRESS") inProgressCount++;

    return {
      id: row.id,
      paymentTitle: row.payment.title,
      customerName,
      actionType: row.actionType,
      status: row.status,
      title: row.title,
      aiReason: row.aiReason,
      daysOpen,
      priority: row.priority,
      events: eventsMap.get(row.id) ?? [],
    };
  });

  return { openCount, inProgressCount, items };
}
