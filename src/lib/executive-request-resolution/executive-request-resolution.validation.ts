import { EntityOrganizationScopeError, assertEntityOrganizationScope } from "./entity-resolution.types";
import { ExecutiveRequestResolutionValidationError } from "./executive-request-resolution.errors";
import type { ResolutionValidationIssue } from "./executive-request-resolution.errors";
import type {
  ExecutiveRequestResolution,
  ResolvedCapability,
} from "./executive-request-resolution.types";
import type { ResolutionConfidence } from "./entity-resolution.types";

export function assertValidExecutiveRequestResolution<TUnderstanding>(
  resolution: unknown,
  expectedOrganizationId: string,
  expectedUnderstanding: TUnderstanding,
): asserts resolution is ExecutiveRequestResolution<TUnderstanding> {
  const issues: ResolutionValidationIssue[] = [];
  if (!isRecord(resolution)) {
    throw new ExecutiveRequestResolutionValidationError([
      issue("resolution", "INVALID_ROOT", "Resolution must be an object."),
    ]);
  }
  if (
    !Array.isArray(resolution.capabilities)
    || !Array.isArray(resolution.entities)
    || !Array.isArray(resolution.requiredContexts)
    || !Array.isArray(resolution.missingInformation)
  ) {
    throw new ExecutiveRequestResolutionValidationError([
      issue("resolution", "INVALID_COLLECTIONS", "Resolution collections must be arrays."),
    ]);
  }

  const typedResolution = resolution as ExecutiveRequestResolution<TUnderstanding>;
  const capabilities: readonly ResolvedCapability[] = Array.isArray(typedResolution.capabilities)
    ? typedResolution.capabilities as readonly ResolvedCapability[]
    : [];
  const primaryCount = capabilities.filter((capability) => capability.role === "PRIMARY").length;

  validateConfidence(typedResolution.confidence, "confidence", issues);
  if (typedResolution.sourceUnderstanding !== expectedUnderstanding) {
    issues.push(issue(
      "sourceUnderstanding",
      "SOURCE_UNDERSTANDING_MISMATCH",
      "Resolution must retain the exact upstream understanding value.",
    ));
  }
  capabilities.forEach((capability, index) => {
    validateConfidence(capability.confidence, `capabilities[${index}].confidence`, issues);
    capability.evidence.forEach((evidence, evidenceIndex) => {
      validateConfidence(
        evidence.confidence,
        `capabilities[${index}].evidence[${evidenceIndex}].confidence`,
        issues,
      );
    });
  });

  if (typedResolution.status === "RESOLVED" && primaryCount !== 1) {
    issues.push(issue("capabilities", "PRIMARY_COUNT", "RESOLVED requires exactly one primary capability."));
  }
  if (typedResolution.status === "RESOLVED" && (typedResolution.executionMode as string) === "CLARIFICATION") {
    issues.push(issue("executionMode", "INVALID_RESOLVED_MODE", "RESOLVED cannot use CLARIFICATION mode."));
  }
  if ((typedResolution.status === "NO_MATCH" || typedResolution.status === "AMBIGUOUS") && primaryCount !== 0) {
    issues.push(issue("capabilities", "PRIMARY_NOT_ALLOWED", `${typedResolution.status} cannot contain a primary capability.`));
  }
  if (typedResolution.status === "NO_MATCH" && capabilities.length !== 0) {
    issues.push(issue("capabilities", "CAPABILITIES_NOT_ALLOWED", "NO_MATCH cannot contain capability matches."));
  }
  if (typedResolution.status === "AMBIGUOUS" && capabilities.length < 2) {
    issues.push(issue("capabilities", "AMBIGUOUS_CANDIDATES", "AMBIGUOUS requires at least two candidates."));
  }
  if (typedResolution.status === "CLARIFICATION_REQUIRED") {
    const hasBlockingInformation = typedResolution.missingInformation.some((item) => item.blocking);
    if (!hasBlockingInformation || typedResolution.executionMode !== "CLARIFICATION") {
      issues.push(issue(
        "missingInformation",
        "BLOCKING_CLARIFICATION_REQUIRED",
        "CLARIFICATION_REQUIRED requires blocking information and CLARIFICATION mode.",
      ));
    }
    if (primaryCount > 1) {
      issues.push(issue("capabilities", "PRIMARY_COUNT", "Clarification may contain at most one primary capability."));
    }
  }

  typedResolution.entities.forEach((entity, index) => {
    validateConfidence(entity.confidence, `entities[${index}].confidence`, issues);
    try {
      assertEntityOrganizationScope(entity, expectedOrganizationId);
    } catch (error) {
      if (error instanceof EntityOrganizationScopeError) {
        issues.push(issue(`entities[${index}]`, "ORGANIZATION_SCOPE", error.message));
      } else {
        throw error;
      }
    }
  });

  if (issues.length > 0) {
    throw new ExecutiveRequestResolutionValidationError(issues);
  }
}

function validateConfidence(
  confidence: ResolutionConfidence,
  path: string,
  issues: ResolutionValidationIssue[],
): void {
  if (confidence.score !== undefined && (
    !Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 1
  )) {
    issues.push(issue(path, "CONFIDENCE_RANGE", "Confidence score must be between 0 and 1."));
  }
}

function issue(path: string, code: string, message: string): ResolutionValidationIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
