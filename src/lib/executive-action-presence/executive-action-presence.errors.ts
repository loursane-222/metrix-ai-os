export class ExecutiveActionPresenceInputError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ExecutiveActionPresenceInputError";
    this.field = field;
  }
}
