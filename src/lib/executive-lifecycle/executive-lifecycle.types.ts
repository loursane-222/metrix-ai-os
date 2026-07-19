export type ExecutiveLifecycleSource = "action" | "approval" | "draft" | "document" | "extraction" | "preview";
export type ExecutiveLifecycleStatus = "pending" | "active" | "waiting" | "succeeded" | "failed" | "cancelled" | "expired";

export type ExecutiveLifecycleTarget = Readonly<{
  executiveTargetId?: string;
  entityType?: string;
  entityId?: string;
  fieldIds?: readonly string[];
}>;

type EnvelopeBase<TSource extends ExecutiveLifecycleSource, TPhase extends string> = Readonly<{
  envelopeId: string;
  source: TSource;
  phase: TPhase;
  status: ExecutiveLifecycleStatus;
  timestamp: number;
  correlationId: string;
  sessionId: string;
  organizationId?: string;
  actorId?: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  actionKey?: string;
  target?: ExecutiveLifecycleTarget;
  summary: string;
  detail?: string;
  recoverability?: "retryable" | "non_retryable" | "user_action";
  outcome?: "succeeded" | "failed" | "cancelled" | "rejected" | "expired";
  error?: Readonly<{ code: string; message: string; retryable: boolean }>;
  verification?: Readonly<{ status: "passed" | "failed"; summary: string }>;
}>;

export type ActionLifecycleEnvelope = EnvelopeBase<
  "action",
  "requested" | "authorized" | "started" | "progressed" | "succeeded" | "failed" | "cancelled" | "rolled_back" | "verified"
> & Readonly<{
  action: Readonly<{
    executionId?: string;
    operationId?: string;
    expectedVersion?: string;
    resultingVersion?: string;
    affectedFields?: readonly string[];
    auditRef?: string;
  }>;
}>;

export type ApprovalLifecycleEnvelope = EnvelopeBase<
  "approval",
  "requested" | "awaiting_decision" | "approved" | "rejected" | "expired" | "cancelled" | "resolution_failed"
> & Readonly<{
  approval: Readonly<{
    approvalId: string;
    actionName: string;
    expiresAt: string;
    currentStatus: "PENDING" | "GRANTED" | "EXPIRED" | "REVOKED" | "CONSUMED";
    reason?: string;
    diff?: readonly Readonly<{ field: string; before?: unknown; after?: unknown }>[];
  }>;
}>;

export type DraftLifecycleEnvelope = EnvelopeBase<
  "draft",
  "requested" | "created" | "updated" | "ready" | "committed" | "discarded" | "failed"
> & Readonly<{
  draft: Readonly<{
    draftId: string;
    draftType?: string;
    changedFields?: readonly string[];
    sourceDocumentId?: string;
    approvalId?: string;
  }>;
}>;

export type DocumentLifecycleEnvelope = EnvelopeBase<
  "document" | "extraction" | "preview",
  "uploaded" | "reading" | "extracting" | "extracted" | "preview_ready" | "draft_handoff" | "failed" | "cancelled"
> & Readonly<{
  document: Readonly<{
    documentId: string;
    filename?: string;
    mediaType?: string;
    category?: string;
    extractedFieldCount?: number;
    previewRef?: string;
    draftId?: string;
    failureCategory?: string;
  }>;
}>;

export type ExecutiveLifecycleEnvelope =
  | ActionLifecycleEnvelope
  | ApprovalLifecycleEnvelope
  | DraftLifecycleEnvelope
  | DocumentLifecycleEnvelope;

export type ExecutiveLifecycleSink = (envelope: ExecutiveLifecycleEnvelope) => void;
