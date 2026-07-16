export class PageContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageContextError";
  }
}

export class ContextAlreadyExistsError extends PageContextError {
  constructor() {
    super("A page context is already active; use replaceContext() or updateContext() instead.");
    this.name = "ContextAlreadyExistsError";
  }
}

export class NoActiveContextError extends PageContextError {
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation} requires an active page context; none exists.`);
    this.name = "NoActiveContextError";
    this.operation = operation;
  }
}

export class InvalidPageContextInputError extends PageContextError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`Page context input is invalid: ${reasons.join("; ")}`);
    this.name = "InvalidPageContextInputError";
    this.reasons = reasons;
  }
}
