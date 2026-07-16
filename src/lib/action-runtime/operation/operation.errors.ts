export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

export class OperationNotFoundError extends OperationError {
  readonly operationId: string;

  constructor(operationId: string) {
    super(`Operation "${operationId}" was not found.`);
    this.name = "OperationNotFoundError";
    this.operationId = operationId;
  }
}

export class InvalidOperationTransitionError extends OperationError {
  readonly operationId: string;
  readonly fromStatus: string;
  readonly toStatus: string;

  constructor(operationId: string, fromStatus: string, toStatus: string) {
    super(`Operation "${operationId}" cannot transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidOperationTransitionError";
    this.operationId = operationId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class OperationPersistenceError extends OperationError {
  constructor(message: string) {
    super(message);
    this.name = "OperationPersistenceError";
  }
}
