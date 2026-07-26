import type {
  ExecutiveAssessmentConfidenceV1,
  ExecutiveAssessmentSourceV1,
  ExecutiveAssessmentStatusV1,
  ExecutiveAssessmentV1,
} from "./executive-assessment.contracts";

const SOURCES = new Set<ExecutiveAssessmentSourceV1>([
  "executive_brain",
  "deterministic_fallback",
  "unavailable",
]);
const STATUSES = new Set<ExecutiveAssessmentStatusV1>([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
const CONFIDENCE = new Set<ExecutiveAssessmentConfidenceV1>([
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export function validateExecutiveAssessmentV1(
  value: ExecutiveAssessmentV1,
): ExecutiveAssessmentV1 {
  if (value.schemaVersion !== "1.0") {
    throw new TypeError("ExecutiveAssessmentV1.schemaVersion must be 1.0.");
  }
  if (value.assessmentId.trim().length === 0) {
    throw new TypeError("ExecutiveAssessmentV1.assessmentId is required.");
  }
  if (!SOURCES.has(value.source) || !STATUSES.has(value.status)) {
    throw new TypeError("ExecutiveAssessmentV1 source/status is invalid.");
  }
  if (!CONFIDENCE.has(value.confidence)) {
    throw new TypeError("ExecutiveAssessmentV1 confidence is invalid.");
  }
  if (value.status === "UNAVAILABLE" && value.source !== "unavailable") {
    throw new TypeError("Unavailable assessment must use the unavailable source.");
  }

  return value;
}

export function freezeExecutiveAssessmentV1(
  value: ExecutiveAssessmentV1,
): ExecutiveAssessmentV1 {
  return deepFreeze(validateExecutiveAssessmentV1(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
