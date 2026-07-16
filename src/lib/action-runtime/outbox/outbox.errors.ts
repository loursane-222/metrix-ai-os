export class OutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxError";
  }
}

export class DuplicateOutboxEventError extends OutboxError {
  readonly identifier: string;

  constructor(identifier: string) {
    super(`An outbox event already exists for identifier "${identifier}".`);
    this.name = "DuplicateOutboxEventError";
    this.identifier = identifier;
  }
}

export class OutboxEventNotFoundError extends OutboxError {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`Outbox event "${eventId}" was not found.`);
    this.name = "OutboxEventNotFoundError";
    this.eventId = eventId;
  }
}

export class InvalidOutboxTransitionError extends OutboxError {
  readonly eventId: string;
  readonly fromStatus: string;
  readonly toStatus: string;

  constructor(eventId: string, fromStatus: string, toStatus: string) {
    super(`Outbox event "${eventId}" cannot transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidOutboxTransitionError";
    this.eventId = eventId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class OutboxPersistenceError extends OutboxError {
  constructor(message: string) {
    super(message);
    this.name = "OutboxPersistenceError";
  }
}
