import type {
  CollectionActionEventType,
  CollectionActionStatus,
  CollectionActionSource,
} from "@prisma/client";

export type { CollectionActionEventType };

export type CollectionActionEventSummary = {
  eventType: CollectionActionEventType;
  fromStatus: CollectionActionStatus | null;
  toStatus: CollectionActionStatus | null;
  note: string | null;
  expectedDate: Date | null;
  createdAt: Date;
};

export type CreateCollectionActionEventInput = {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
  eventType: CollectionActionEventType;
  fromStatus?: CollectionActionStatus | null;
  toStatus?: CollectionActionStatus | null;
  note?: string | null;
  expectedDate?: Date | null;
  source?: CollectionActionSource;
};
