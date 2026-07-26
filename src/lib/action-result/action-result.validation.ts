import type { ActionResultV1 } from "./action-result.contracts";

const STATUSES = new Set(["SUCCEEDED", "NO_CHANGE", "FAILED", "BLOCKED", "WAITING_APPROVAL", "CANCELLED"]);
const AUTHORIZATION = new Set(["AUTHORIZED", "DENIED", "REQUIRES_APPROVAL", "NOT_APPLICABLE", "UNKNOWN"]);
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/u;
const EXECUTION_OUTCOMES = new Set(["SUCCEEDED", "NO_CHANGE", "REPLAYED", "FAILED", "BLOCKED", "WAITING_APPROVAL", "CANCELLED"]);

export function validateActionResultV1(value: ActionResultV1): ActionResultV1 {
  if (value.schemaVersion !== "1.0") throw new TypeError("ActionResultV1.schemaVersion must be 1.0.");
  if (!value.actionResultId.trim() || !value.correlationId.trim() || !SAFE_NAME.test(value.actionName)) {
    throw new TypeError("ActionResultV1 identifiers are invalid.");
  }
  if (!STATUSES.has(value.status) || !AUTHORIZATION.has(value.authorization.status)) {
    throw new TypeError("ActionResultV1 status or authorization is invalid.");
  }
  if (!EXECUTION_OUTCOMES.has(value.executionOutcome)) {
    throw new TypeError("ActionResultV1 execution outcome is invalid.");
  }
  if (value.status === "SUCCEEDED" && (!value.executionId || !value.operationId)) {
    throw new TypeError("SUCCEEDED ActionResultV1 requires execution and operation references.");
  }
  if (value.status === "WAITING_APPROVAL" && (
    !value.authorization.approvalRequired
    || value.authorization.status !== "REQUIRES_APPROVAL"
    || value.mutation.performed
  )) {
    throw new TypeError("WAITING_APPROVAL cannot perform mutation and must require approval.");
  }
  if (value.status === "NO_CHANGE" && (
    value.mutation.performed
    || !value.mutation.noChange
    || value.mutation.changedFields.length > 0
  )) {
    throw new TypeError("NO_CHANGE mutation evidence is inconsistent.");
  }
  if (value.mutation.performed && !value.mutation.attempted) {
    throw new TypeError("Performed mutation must have been attempted.");
  }
  if (!value.mutation.changedFields.every((field) => SAFE_NAME.test(field))) {
    throw new TypeError("ActionResultV1 contains an unsafe changed field name.");
  }
  if (value.status === "FAILED" && (!value.failure.code || !value.failure.category)) {
    throw new TypeError("FAILED ActionResultV1 requires safe failure metadata.");
  }
  if (
    value.status !== "FAILED"
    && value.status !== "BLOCKED"
    && value.status !== "WAITING_APPROVAL"
    && value.status !== "CANCELLED"
    && value.failure.safeSummary !== null
  ) {
    throw new TypeError("Successful ActionResultV1 cannot contain a failure summary.");
  }
  if (!value.evidence.every((reference) => Boolean(reference.id.trim()) && SAFE_NAME.test(reference.kind))) {
    throw new TypeError("ActionResultV1 contains an invalid evidence reference.");
  }
  if (!value.sideEffects.every((reference) =>
    Boolean(reference.id.trim()) && SAFE_NAME.test(reference.type) && SAFE_NAME.test(reference.status)
  )) {
    throw new TypeError("ActionResultV1 contains an invalid side-effect reference.");
  }
  for (const timestamp of [
    value.completion.startedAt,
    value.completion.completedAt,
    value.generatedAt,
  ]) {
    if (timestamp !== null && Number.isNaN(Date.parse(timestamp))) {
      throw new TypeError("ActionResultV1 contains an invalid timestamp.");
    }
  }
  return value;
}

export function freezeActionResultV1(value: ActionResultV1): ActionResultV1 {
  return deepFreeze(validateActionResultV1(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
