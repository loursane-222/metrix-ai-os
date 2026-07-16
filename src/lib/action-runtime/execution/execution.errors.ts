export class ExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}

export class RegistryLookupFailedError extends ExecutionError {
  readonly actionName: string;

  constructor(actionName: string) {
    super(`Action "${actionName}" could not be resolved from the Registry.`);
    this.name = "RegistryLookupFailedError";
    this.actionName = actionName;
  }
}

/** Domain Action Execution Runtime yalnızca actionClass=DOMAIN eylemleri çalıştırabilir. */
export class ExecutionRejectedError extends ExecutionError {
  readonly actionName: string;
  readonly reason: string;

  constructor(actionName: string, reason: string) {
    super(`Execution of "${actionName}" was rejected: ${reason}`);
    this.name = "ExecutionRejectedError";
    this.actionName = actionName;
    this.reason = reason;
  }
}

export class InputValidationError extends ExecutionError {
  readonly actionName: string;
  readonly reasons: readonly string[];

  constructor(actionName: string, reasons: readonly string[]) {
    super(`Input for action "${actionName}" is invalid: ${reasons.join("; ")}`);
    this.name = "InputValidationError";
    this.actionName = actionName;
    this.reasons = reasons;
  }
}

export class PolicyDeniedError extends ExecutionError {
  readonly actionName: string;
  readonly reasonCode: string;

  constructor(actionName: string, reasonCode: string) {
    super(`Action "${actionName}" was denied by policy (${reasonCode}).`);
    this.name = "PolicyDeniedError";
    this.actionName = actionName;
    this.reasonCode = reasonCode;
  }
}

export class ApprovalRequiredError extends ExecutionError {
  readonly actionName: string;
  readonly reasonCode?: string;

  constructor(actionName: string, reasonCode?: string) {
    super(`Action "${actionName}" requires a valid approval grant${reasonCode ? ` (${reasonCode})` : ""}.`);
    this.name = "ApprovalRequiredError";
    this.actionName = actionName;
    this.reasonCode = reasonCode;
  }
}

export class IdempotencyConflictError extends ExecutionError {
  readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(`Idempotency key "${idempotencyKey}" conflicts with a different in-flight or completed request.`);
    this.name = "IdempotencyConflictError";
    this.idempotencyKey = idempotencyKey;
  }
}

export class HandlerNotFoundError extends ExecutionError {
  readonly actionName: string;

  constructor(actionName: string) {
    super(`No handler is registered for action "${actionName}".`);
    this.name = "HandlerNotFoundError";
    this.actionName = actionName;
  }
}

export class HandlerAlreadyRegisteredError extends ExecutionError {
  readonly actionName: string;

  constructor(actionName: string) {
    super(`A handler is already registered for action "${actionName}".`);
    this.name = "HandlerAlreadyRegisteredError";
    this.actionName = actionName;
  }
}

export class ExecutionFailedError extends ExecutionError {
  readonly actionName: string;
  readonly executionId: string;
  readonly cause: unknown;

  constructor(actionName: string, executionId: string, cause: unknown) {
    super(`Handler for action "${actionName}" threw during execution "${executionId}".`);
    this.name = "ExecutionFailedError";
    this.actionName = actionName;
    this.executionId = executionId;
    this.cause = cause;
  }
}
