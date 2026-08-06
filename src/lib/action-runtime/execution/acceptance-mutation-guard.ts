import type { ActionExecutionRequest } from "./execution.types";

const ACCEPTANCE_MUTATION_ACTIONS = /^(customer|task|quote|invoice|payment)\.(create|update|archive|apply|send|dispatch)$/u;

export function isAcceptanceMutationRequest(request: Pick<ActionExecutionRequest, "actionName" | "input">): boolean {
  if (!ACCEPTANCE_MUTATION_ACTIONS.test(request.actionName)) return false;
  return hasAcceptanceSource(request.input);
}

/**
 * Acceptance records may only be created in an explicitly isolated runtime.
 * A source marker alone can never silently write into a live organisation.
 */
export function assertAcceptanceMutationAllowed(request: Pick<ActionExecutionRequest, "actionName" | "input">): void {
  if (!isAcceptanceMutationRequest(request)) return;
  const allowed = process.env.NODE_ENV === "test" || process.env.ACCEPTANCE_MODE === "isolated";
  if (allowed) return;
  throw new Error("ACCEPTANCE_MUTATION_BLOCKED: acceptance mutations require NODE_ENV=test or ACCEPTANCE_MODE=isolated");
}

function hasAcceptanceSource(input: Record<string, unknown>): boolean {
  const candidates = [input.source, input.metadata, input.provenance, input.acceptanceSource];
  return candidates.some((value) => {
    if (typeof value === "string") return value === "ACCEPTANCE" || value === "ACCEPTANCE_TEST";
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const source = (value as Record<string, unknown>).source;
    return source === "ACCEPTANCE" || source === "ACCEPTANCE_TEST";
  });
}

