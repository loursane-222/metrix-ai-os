export type LiveSessionStatus =
  | "BOOTSTRAPPING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "CLOSED"
  | "FAILED";

export type LiveSessionBinding = {
  id: string;
  openAiSessionId: string | null;
  userId: string;
  organizationId: string;
  status: LiveSessionStatus;
  createdAt: Date;
  connectedAt: Date | null;
  sidebandAttachedAt: Date | null;
  endedAt: Date | null;
  failureCode: string | null;
};
