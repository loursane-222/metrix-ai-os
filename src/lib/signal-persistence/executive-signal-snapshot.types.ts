export type SnapshotType = "DAILY_ANCHOR" | "RISK_ESCALATION";

export type EscalationKey = "WATCH_TO_HIGH" | "HIGH_TO_CRITICAL";

export type CreateSignalSnapshotInput = {
  organizationId: string;
  snapshotDate: string;
  snapshotType: SnapshotType;
  overallRisk: string;
  snapshotPayload: object;
  escalationFrom?: string | null;
  escalationTo?: string | null;
  escalationKey?: string | null;
};
