import type {
  CollectionActionStatus,
  CollectionActionType,
  CollectionActionSource,
} from "@prisma/client";

export type { CollectionActionStatus, CollectionActionType, CollectionActionSource };

export type CollectionActionRecord = {
  id: string;
  organizationId: string;
  paymentId: string;
  title: string;
  description: string | null;
  actionType: CollectionActionType;
  status: CollectionActionStatus;
  source: CollectionActionSource;
  priority: number;
  aiReason: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  dismissedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCollectionActionInput = {
  organizationId: string;
  paymentId: string;
  title: string;
  description?: string | null;
  actionType: CollectionActionType;
  source?: CollectionActionSource;
  priority?: number;
  aiReason?: string | null;
  dueDate?: Date | null;
};

export type UpdateCollectionActionStatusInput = {
  id: string;
  organizationId: string;
  status: CollectionActionStatus;
  notes?: string | null;
};

export type SuggestedAction = {
  paymentId: string;
  actionType: CollectionActionType;
  title: string;
  aiReason: string;
  priority: number;
};
