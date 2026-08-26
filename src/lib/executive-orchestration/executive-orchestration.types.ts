// Domain 26 — Yönetici Orkestrasyon Motoru. Scope: an ordered, sequential
// chain of steps, each delegating to an already-existing, already-
// authorized Executive Action Engine (action-runtime) action — including
// ones that require an EXPLICIT human approval (quote.dispatch,
// customer.archive, ...), which pause the whole chain in AWAITING_APPROVAL
// until a later turn resumes it (see executive-orchestration.service.ts).
// A mid-chain failure is never left half-done: runCompensationPass walks
// already-COMPLETED steps in reverse and executes each one's compensating
// action (see compensation.ts), landing on COMPENSATED (clean, reversed
// state) or COMPENSATION_FAILED (needs a human — surfaced, never hidden).
//
// Deliberately still NOT in scope (see Domain_Sözleşme/26): dynamic
// dependency-graph resolution, parallel execution, exception/recovery
// intelligence beyond one clean compensation attempt per completed step,
// and learning intelligence.

export type OrchestrationStepResult = Readonly<{
  entityType: string;
  entityId: string;
}>;

export type OrchestrationRunContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  // Index i holds the result of the step at sequence i+1, or null if that
  // step failed/was skipped/hasn't run yet.
  priorResults: readonly (OrchestrationStepResult | null)[];
}>;

// A field value of exactly this shape is a same-plan step reference — its
// real value is the entity an earlier step in the SAME plan creates (e.g. a
// delivery's sourceOrderId should be the order step 1 just created). It is
// a plain, JSON-serializable sentinel (not a closure) specifically so a
// step's resolved args can be persisted to OrchestrationStep.input and read
// back to resume execution in a later HTTP request/turn, after an
// approval-gated step paused the chain.
export type OrchestrationStepReference = Readonly<{ $stepRef: number }>;

export function isStepReference(value: unknown): value is OrchestrationStepReference {
  return typeof value === "object" && value !== null && typeof (value as { $stepRef?: unknown }).$stepRef === "number";
}

export type OrchestrationStepArgs = Readonly<Record<string, unknown | OrchestrationStepReference>>;

export type OrchestrationStepPlan = Readonly<{
  domain: string;
  actionName: string;
  argsTemplate: OrchestrationStepArgs;
}>;

export type OrchestrationPlan = Readonly<{
  steps: readonly OrchestrationStepPlan[];
}>;

export type OrchestrationStepStatusValue =
  | "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "SKIPPED"
  | "COMPENSATING" | "COMPENSATED" | "COMPENSATION_FAILED" | "COMPENSATION_AWAITING_APPROVAL";
export type OrchestrationStatusValue =
  | "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED"
  | "COMPENSATING" | "COMPENSATED" | "COMPENSATION_FAILED";

export type OrchestrationStepView = Readonly<{
  id: string;
  sequence: number;
  domain: string;
  actionName: string;
  status: OrchestrationStepStatusValue;
  approvalRequestId: string | null;
  resultEntityType: string | null;
  resultEntityId: string | null;
  errorMessage: string | null;
}>;

export type OrchestrationView = Readonly<{
  id: string;
  status: OrchestrationStatusValue;
  triggerUtterance: string;
  steps: readonly OrchestrationStepView[];
}>;
