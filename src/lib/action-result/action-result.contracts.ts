import type { ExecutionOutcome } from "@/lib/action-runtime/execution/execution.types";

export type ActionResultStatusV1 =
  | "SUCCEEDED"
  | "NO_CHANGE"
  | "FAILED"
  | "BLOCKED"
  | "WAITING_APPROVAL"
  | "CANCELLED";

export type ActionResultEvidenceReferenceV1 = Readonly<{
  id: string;
  kind: "EXECUTION" | "OPERATION" | "AUDIT" | "DOMAIN_EVENT" | "ACTION_RESULT";
}>;

export type ActionResultSideEffectReferenceV1 = Readonly<{
  id: string;
  type: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "UNKNOWN";
}>;

export type ActionResultV1 = Readonly<{
  schemaVersion: "1.0";
  actionResultId: string;
  executionId: string | null;
  operationId: string | null;
  correlationId: string;
  actionName: string;
  status: ActionResultStatusV1;
  executionOutcome: ExecutionOutcome | "BLOCKED" | "WAITING_APPROVAL" | "CANCELLED";
  target: Readonly<{
    entityType: string | null;
    entityId: string | null;
  }>;
  authorization: Readonly<{
    status: "AUTHORIZED" | "DENIED" | "REQUIRES_APPROVAL" | "NOT_APPLICABLE" | "UNKNOWN";
    approvalId: string | null;
    approvalRequired: boolean;
  }>;
  mutation: Readonly<{
    attempted: boolean;
    performed: boolean;
    changedFields: readonly string[];
    noChange: boolean;
  }>;
  completion: Readonly<{
    startedAt: string | null;
    completedAt: string | null;
    retryable: boolean | null;
    idempotentReplay: boolean;
  }>;
  sideEffects: readonly ActionResultSideEffectReferenceV1[];
  failure: Readonly<{
    code: string | null;
    category: string | null;
    safeSummary: string | null;
  }>;
  evidence: readonly ActionResultEvidenceReferenceV1[];
  generatedAt: string;
}>;

export type ActionResultOutcomeEvidenceV1 = Readonly<{
  id: string;
  kind: "ACTION_RESULT";
  actionName: string;
  status: ActionResultStatusV1;
}>;
