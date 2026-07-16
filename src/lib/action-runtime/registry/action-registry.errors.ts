export class ActionRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionRegistryError";
  }
}

export class DuplicateActionDefinitionError extends ActionRegistryError {
  readonly actionName: string;

  constructor(actionName: string) {
    super(`Action "${actionName}" is already registered.`);
    this.name = "DuplicateActionDefinitionError";
    this.actionName = actionName;
  }
}

export class InvalidActionDefinitionError extends ActionRegistryError {
  readonly actionName: string | undefined;
  readonly reasons: readonly string[];

  constructor(actionName: string | undefined, reasons: readonly string[]) {
    super(`Action definition${actionName ? ` "${actionName}"` : ""} is invalid: ${reasons.join("; ")}`);
    this.name = "InvalidActionDefinitionError";
    this.actionName = actionName;
    this.reasons = reasons;
  }
}

export class ActionNotFoundError extends ActionRegistryError {
  readonly actionName: string;

  constructor(actionName: string) {
    super(`Action "${actionName}" was not found in the registry.`);
    this.name = "ActionNotFoundError";
    this.actionName = actionName;
  }
}
