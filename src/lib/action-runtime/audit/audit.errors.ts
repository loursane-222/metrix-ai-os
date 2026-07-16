export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

export class AuditRecordNotFoundError extends AuditError {
  readonly auditId: string;

  constructor(auditId: string) {
    super(`Audit record "${auditId}" was not found.`);
    this.name = "AuditRecordNotFoundError";
    this.auditId = auditId;
  }
}

export class AuditMutationNotAllowedError extends AuditError {
  readonly auditId: string;
  readonly attemptedOperation: string;

  constructor(auditId: string, attemptedOperation: string) {
    super(`Audit record "${auditId}" is append-only and cannot be mutated (${attemptedOperation}).`);
    this.name = "AuditMutationNotAllowedError";
    this.auditId = auditId;
    this.attemptedOperation = attemptedOperation;
  }
}

export class AuditPersistenceError extends AuditError {
  constructor(message: string) {
    super(message);
    this.name = "AuditPersistenceError";
  }
}
