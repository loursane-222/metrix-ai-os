// Domain 26 — Yönetici Orkestrasyon Motoru. v1 scope: an ordered,
// sequential chain of steps, each delegating to an already-existing,
// already-authorized Executive Action Engine (action-runtime) action.
//
// Deliberately NOT in v1 (see Domain_Sözleşme/26): dynamic dependency-graph
// resolution, parallel execution, rollback/compensation on partial failure,
// exception/recovery intelligence beyond "stop and mark the rest SKIPPED",
// and learning intelligence. A step requiring an EXPLICIT approval gate
// (e.g. quote.dispatch) will simply fail synchronously today — orchestration
// does not yet know how to pause, request approval, and resume.

export type OrchestrationStepResult = Readonly<{
  entityType: string;
  entityId: string;
}>;

export type OrchestrationRunContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  // Index i holds the result of the step at sequence i+1, or null if that
  // step failed/was skipped — lets a later step's input reference an
  // earlier step's created record (e.g. a task referencing the quote it
  // followed up on).
  priorResults: readonly (OrchestrationStepResult | null)[];
}>;

export type OrchestrationStepPlan = Readonly<{
  domain: string;
  actionName: string;
  buildInput: (context: OrchestrationRunContext) => Record<string, unknown>;
}>;

export type OrchestrationPlan = Readonly<{
  steps: readonly OrchestrationStepPlan[];
}>;

export type OrchestrationStepView = Readonly<{
  id: string;
  sequence: number;
  domain: string;
  actionName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  resultEntityType: string | null;
  resultEntityId: string | null;
  errorMessage: string | null;
}>;

export type OrchestrationView = Readonly<{
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  triggerUtterance: string;
  steps: readonly OrchestrationStepView[];
}>;
