export type ExecutivePresenceStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "applying"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "error";

export type ExecutivePresenceSignalCategory =
  | "voice_listening"
  | "conversation_thinking"
  | "surface_applying"
  | "approval_pending"
  | "action_executing";

export type ExecutivePresenceTerminalOutcome = "success" | "error" | null;

export type ExecutivePresenceErrorCategory = "operation" | "presentation_connection";

export type ExecutivePresenceActiveSignal = Readonly<{
  category: ExecutivePresenceSignalCategory;
  status: Exclude<
    ExecutivePresenceStatus,
    "idle" | "completed" | "error"
  >;
  source: string;
  correlationId: string;
  operationId: string | null;
  scopeId: string | null;
  reason: string | null;
  startedAt: number;
  updatedAt: number;
}>;

export type ExecutivePresenceTerminalFeedback = Readonly<{
  outcome: Exclude<ExecutivePresenceTerminalOutcome, null>;
  source: string;
  correlationId: string | null;
  operationId: string | null;
  scopeId: string | null;
  reason: string | null;
  error: string | null;
  errorCategory: ExecutivePresenceErrorCategory | null;
  startedAt: number;
  visibleUntil: number;
}>;

export type ExecutivePresenceSnapshot = Readonly<{
  status: ExecutivePresenceStatus;
  activeSignals: readonly ExecutivePresenceActiveSignal[];
  activeOperationId: string | null;
  correlationId: string | null;
  scopeId: string | null;
  source: string | null;
  reason: string | null;
  error: string | null;
  errorCategory: ExecutivePresenceErrorCategory | null;
  startedAt: number | null;
  updatedAt: number | null;
  terminalOutcome: ExecutivePresenceTerminalOutcome;
  terminalFeedback: ExecutivePresenceTerminalFeedback | null;
}>;

export type ExecutivePresenceEngineOptions = Readonly<{
  completedVisibilityMs?: number;
  errorVisibilityMs?: number;
  /**
   * Maximum remembered event IDs (default 1024). Oldest IDs are evicted in
   * FIFO order, keeping idempotency memory bounded rather than an audit log.
   */
  processedEventLimit?: number;
}>;

export type ExecutivePresenceSnapshotListener = (
  snapshot: ExecutivePresenceSnapshot,
) => void;
