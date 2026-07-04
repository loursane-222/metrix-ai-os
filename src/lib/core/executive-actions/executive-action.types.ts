export type ExecutiveActionStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "DONE"
  | "CANCELLED";

export type ExecutiveActionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ExecutiveActionOutcomeStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "UNKNOWN";

export type ExecutiveActionSourceType =
  | "EXECUTIVE_PRIORITY"
  | "DAILY_BRIEFING"
  | "MANAGEMENT_REVIEW"
  | "PERFORMANCE_SIGNAL"
  | "CUSTOMER_SIGNAL"
  | "DECISION"
  | "MANUAL";

export type ExecutiveActionOwnerType =
  | "USER"
  | "PERSON"
  | "METRIX"
  | "UNASSIGNED";

export type ExecutiveAction = {
  id: string;
  organizationId: string;
  sourceType: ExecutiveActionSourceType;
  sourceId: string | null;
  title: string;
  reason: string;
  priority: ExecutiveActionPriority;
  ownerType: ExecutiveActionOwnerType;
  ownerId: string | null;
  status: ExecutiveActionStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  resultSummary: string | null;
  outcomeStatus: ExecutiveActionOutcomeStatus | null;
};

export type CreateExecutiveActionInput = {
  organizationId: string;
  sourceType: ExecutiveActionSourceType;
  sourceId?: string | null;
  title: string;
  reason: string;
  priority?: ExecutiveActionPriority;
  ownerType?: ExecutiveActionOwnerType;
  ownerId?: string | null;
  dueDate?: Date | null;
};

export type CompleteExecutiveActionInput = {
  id: string;
  organizationId: string;
  resultSummary?: string | null;
  outcomeStatus?: ExecutiveActionOutcomeStatus;
};

export type CancelExecutiveActionInput = {
  id: string;
  organizationId: string;
};
