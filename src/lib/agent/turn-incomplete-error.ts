import type { CanonicalCapabilityResult } from "./turn-result";

/**
 * A METRIX Executive turn that threw AFTER at least one business mutation had
 * already been executed and verified by the canonical runtime. The mutation is
 * committed and is not rolled back; only the turn (the model's answer, session
 * writes, conversation binding) did not finish. This is a runtime status, never
 * an Executive answer: it carries the original cause and the VERIFIED canonical
 * mutation results, and nothing that reads like a completed reply.
 */
export class MetrixExecutiveTurnIncompleteError extends Error {
  readonly code = "TURN_INCOMPLETE" as const;
  readonly committed = true as const;
  readonly capabilityResults: CanonicalCapabilityResult[];

  constructor(input: {
    cause: unknown;
    capabilityResults: CanonicalCapabilityResult[];
  }) {
    super("METRIX executive turn ended after a committed mutation", {
      cause: input.cause
    });

    this.name = "MetrixExecutiveTurnIncompleteError";
    this.capabilityResults = input.capabilityResults;
  }
}

/**
 * The results of a turn that are known to be committed: mutations the
 * canonical runtime verified. Reads and unverified results never count, so a
 * failure that follows only those keeps its ordinary exception semantics.
 */
export function committedMutationResults(
  results: CanonicalCapabilityResult[]
): CanonicalCapabilityResult[] {
  return results.filter(
    result =>
      result.operation === "mutation" &&
      result.verification?.verified === true &&
      result.verification.status === "VERIFIED"
  );
}
