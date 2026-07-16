export class PolicyEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyEngineError";
  }
}

export class ApprovalRequestNotFoundError extends PolicyEngineError {
  readonly approvalId: string;

  constructor(approvalId: string) {
    super(`Approval request "${approvalId}" was not found.`);
    this.name = "ApprovalRequestNotFoundError";
    this.approvalId = approvalId;
  }
}

export class InvalidApprovalStateError extends PolicyEngineError {
  readonly approvalId: string;
  readonly currentStatus: string;
  readonly attemptedOperation: string;

  constructor(approvalId: string, currentStatus: string, attemptedOperation: string) {
    super(`Cannot ${attemptedOperation} approval "${approvalId}" while it is ${currentStatus}.`);
    this.name = "InvalidApprovalStateError";
    this.approvalId = approvalId;
    this.currentStatus = currentStatus;
    this.attemptedOperation = attemptedOperation;
  }
}
