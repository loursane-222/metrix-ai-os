import type { ExecutiveOutcomeV1 } from "./executive-outcome.contracts";

const VALID_STATUSES = new Set([
  "ACHIEVED",
  "PARTIALLY_ACHIEVED",
  "NOT_ACHIEVED",
  "ABANDONED",
  "PENDING",
  "UNKNOWN",
]);
const VALID_SOURCES = new Set(["SUCCESS", "FAILURE", "ABANDONED", "UNAVAILABLE"]);
const VALID_CONFIDENCE = new Set(["LOW", "MEDIUM", "HIGH"]);

export function validateExecutiveOutcomeV1(
  value: ExecutiveOutcomeV1,
): ExecutiveOutcomeV1 {
  if (value.schemaVersion !== "1.0") {
    throw new TypeError("ExecutiveOutcomeV1.schemaVersion must be 1.0.");
  }
  for (const [name, identifier] of [
    ["outcomeId", value.outcomeId],
    ["decisionRecordId", value.decisionRecordId],
    ["organizationId", value.organizationId],
  ] as const) {
    if (identifier.trim().length === 0) {
      throw new TypeError(`ExecutiveOutcomeV1.${name} is required.`);
    }
  }
  if (
    !VALID_STATUSES.has(value.status)
    || !VALID_SOURCES.has(value.sourceOutcome)
    || !VALID_CONFIDENCE.has(value.confidence)
  ) {
    throw new TypeError("ExecutiveOutcomeV1 status/source/confidence is invalid.");
  }
  if (value.status === "ACHIEVED" && value.sourceOutcome !== "SUCCESS") {
    throw new TypeError("ACHIEVED requires a persisted SUCCESS outcome.");
  }
  if (value.sourceOutcome === "UNAVAILABLE" && value.status === "ACHIEVED") {
    throw new TypeError("Unavailable outcome cannot be achieved.");
  }
  for (const timestamp of [
    value.completion.committedAt,
    value.completion.occurredAt,
    value.completion.closedAt,
    value.completion.followUpDueAt,
    value.generatedAt,
  ]) {
    if (timestamp !== null && Number.isNaN(Date.parse(timestamp))) {
      throw new TypeError("ExecutiveOutcomeV1 contains an invalid timestamp.");
    }
  }
  return value;
}

export function freezeExecutiveOutcomeV1(
  value: ExecutiveOutcomeV1,
): ExecutiveOutcomeV1 {
  return deepFreeze(validateExecutiveOutcomeV1(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
