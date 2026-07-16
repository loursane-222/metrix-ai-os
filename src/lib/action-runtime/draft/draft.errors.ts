export class DraftRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftRuntimeError";
  }
}

export class DraftNotFoundError extends DraftRuntimeError {
  readonly draftId: string;

  constructor(draftId: string) {
    super(`Draft "${draftId}" was not found.`);
    this.name = "DraftNotFoundError";
    this.draftId = draftId;
  }
}

export class DraftAlreadyExistsError extends DraftRuntimeError {
  readonly draftId: string;

  constructor(draftId: string) {
    super(`Draft "${draftId}" already exists.`);
    this.name = "DraftAlreadyExistsError";
    this.draftId = draftId;
  }
}

/** Registry'de actionClass !== SURFACE olan bir eylem bu runtime'a verildiğinde fırlatılır. */
export class DomainActionRejectedError extends DraftRuntimeError {
  readonly actionName: string;
  readonly actualActionClass: string;

  constructor(actionName: string, actualActionClass: string) {
    super(
      `Action "${actionName}" is classified as ${actualActionClass}, not SURFACE; the Draft/Surface Action Runtime cannot process it.`,
    );
    this.name = "DomainActionRejectedError";
    this.actionName = actionName;
    this.actualActionClass = actualActionClass;
  }
}

export class ContextMismatchError extends DraftRuntimeError {
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation} requires an active page context; none exists.`);
    this.name = "ContextMismatchError";
    this.operation = operation;
  }
}

export class EntityMismatchError extends DraftRuntimeError {
  readonly operation: string;
  readonly draftEntityType: string;
  readonly draftEntityId: string;
  readonly contextEntityType: string | null;
  readonly contextEntityId: string | null;

  constructor(
    operation: string,
    draftEntityType: string,
    draftEntityId: string,
    contextEntityType: string | null,
    contextEntityId: string | null,
  ) {
    super(
      `${operation}: draft targets ${draftEntityType}:${draftEntityId} but the active page context points to ${contextEntityType ?? "null"}:${contextEntityId ?? "null"}.`,
    );
    this.name = "EntityMismatchError";
    this.operation = operation;
    this.draftEntityType = draftEntityType;
    this.draftEntityId = draftEntityId;
    this.contextEntityType = contextEntityType;
    this.contextEntityId = contextEntityId;
  }
}

export class VersionMismatchError extends DraftRuntimeError {
  readonly operation: string;
  readonly baseVersion: number;

  constructor(operation: string, baseVersion: number) {
    super(`${operation}: the active page context has moved past the draft's baseVersion (${baseVersion}).`);
    this.name = "VersionMismatchError";
    this.operation = operation;
    this.baseVersion = baseVersion;
  }
}
