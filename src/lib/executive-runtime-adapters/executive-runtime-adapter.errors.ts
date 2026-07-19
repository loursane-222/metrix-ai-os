export class ExecutiveRuntimeAdapterContractError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ExecutiveRuntimeAdapterContractError";
    this.field = field;
  }
}

export class DuplicateExecutiveRuntimeAdapterError extends Error {
  readonly adapterId: string;

  constructor(adapterId: string) {
    super(`Executive runtime adapter "${adapterId}" is already registered.`);
    this.name = "DuplicateExecutiveRuntimeAdapterError";
    this.adapterId = adapterId;
  }
}

export class ExecutiveRuntimeAdapterMapperError extends Error {
  readonly reasonCode: "ACTION_PLAN_REQUIRED" | "RUNTIME_ADAPTER_ID" | "BINDING_MISMATCH" | "INVALID_METADATA";

  constructor(
    reasonCode: ExecutiveRuntimeAdapterMapperError["reasonCode"],
    message: string,
  ) {
    super(message);
    this.name = "ExecutiveRuntimeAdapterMapperError";
    this.reasonCode = reasonCode;
  }
}
