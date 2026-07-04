import {
  ApiValidationError,
  isRecord,
  optionalString,
  type RequestBody,
} from "@/lib/api/validation";
import type { OnboardingAnswers } from "@/lib/recognition/recognition-engine.types";
import type { OnboardingDiscoveryAnalysisInput } from "./onboarding-operating-context.types";

export function readOptionalDiscoveryAnalysis(
  body: RequestBody,
): OnboardingDiscoveryAnalysisInput | null {
  const value = body.discoveryAnalysis;

  if (!isRecord(value)) {
    return null;
  }

  const firstImpression =
    typeof value.firstImpression === "string" ? value.firstImpression.trim() : "";

  if (!firstImpression) {
    return null;
  }

  const rawFocusItems = value.focusItems;
  const focusItems = Array.isArray(rawFocusItems)
    ? rawFocusItems
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  if (focusItems.length === 0) {
    return null;
  }

  const source = value.source === "VOICE_DISCOVERY" ? "VOICE_DISCOVERY" : "EXECUTIVE_DISCOVERY";
  const reason = typeof value.reason === "string" ? value.reason.trim() : null;
  const caveat = typeof value.caveat === "string" ? value.caveat.trim() : null;
  const expectedOutcome =
    typeof value.expectedOutcome === "string" ? value.expectedOutcome.trim() : null;

  return {
    firstImpression,
    focusItems,
    source,
    reason: reason || null,
    caveat: caveat || null,
    expectedOutcome: expectedOutcome || null,
  };
}

export function readOnboardingAnswers(body: RequestBody): OnboardingAnswers {
  const value = body.answers;

  if (!isRecord(value)) {
    throw new ApiValidationError("answers is required.");
  }

  return {
    industry: optionalString(value, "industry"),
    businessType: optionalString(value, "businessType"),
    teamStructure: optionalString(value, "teamStructure"),
    teamSize: optionalString(value, "teamSize"),
    mainChallenge: optionalString(value, "mainChallenge"),
    firstGoal: optionalString(value, "firstGoal"),
  };
}
