// Shared plan-resolution contract for any create-coordinator that has both
// a real (LLM-backed) planner and a deterministic, zero-network fallback.
// The fallback is a legitimate backstop for a subset of utterances, but it
// must never be silently treated as equivalent to a successful planner
// call: a bare `try { await planner() } catch { plan = deterministicFallback() }`
// lets any planner failure (auth, network, malformed LLM output) fall
// through into a plan that gets narrated and projected exactly like a real
// one. When that fallback also finds nothing reliable to extract, the
// result was an empty Living Workspace draft reported as a success — the
// user watched nothing happen and got no honest signal why.
//
// Every create-coordinator with this shape (customer-create, task-create,
// and any future one) must resolve its plan through resolveCreatePlan
// instead of writing its own try/catch, so degraded/failed planner calls
// are always distinguishable from genuine ones — in telemetry and in the
// coordinator's own branching — without duplicating this decision per domain.

export type CreatePlanResolution<TPlan> =
  | { readonly source: "PLANNER"; readonly plan: TPlan }
  // Planner failed, but the deterministic fallback genuinely extracted at
  // least one reliable field (not a guess — a real alias/regex match) or
  // confidently classified a non-field intent (CANCEL/STATUS_QUERY/etc).
  // Safe to proceed with; still logged as degraded, not a full success.
  | { readonly source: "FALLBACK_USABLE"; readonly plan: TPlan; readonly reliableFieldCount: number | null; readonly plannerFailureReason: string }
  // Planner failed AND the fallback found nothing reliable — the caller
  // must not report this as EXECUTED/COMPLETED or open a workspace surface
  // with nothing in it (see resolveCreatePlan callers).
  | { readonly source: "FALLBACK_EMPTY"; readonly plannerFailureReason: string };

export async function resolveCreatePlan<TPlan>(input: {
  readonly callPlanner: () => Promise<TPlan>;
  readonly deterministicFallback: () => TPlan;
  // Returns the number of genuinely-extracted fields for a field-bearing
  // plan kind (e.g. CREATE_PLAN), or null when the plan kind doesn't carry
  // fields at all (STATUS_QUERY, CANCEL, NOT_*_CREATE, CLARIFICATION_REQUIRED)
  // — those are legitimate deterministic answers on their own, not a
  // degraded substitute for one, so they're never treated as "empty".
  readonly countReliableFields: (plan: TPlan) => number | null;
}): Promise<CreatePlanResolution<TPlan>> {
  try {
    return { source: "PLANNER", plan: await input.callPlanner() };
  } catch (cause) {
    const plannerFailureReason = describePlannerFailure(cause);
    const plan = input.deterministicFallback();
    const reliableFieldCount = input.countReliableFields(plan);
    if (reliableFieldCount === 0) return { source: "FALLBACK_EMPTY", plannerFailureReason };
    return { source: "FALLBACK_USABLE", plan, reliableFieldCount, plannerFailureReason };
  }
}

// Diagnostic-only, bounded vocabulary — never the raw error message (could
// contain response bodies, tokens, or other unsafe content).
function describePlannerFailure(cause: unknown): string {
  if (cause instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(cause.message)) return cause.message;
  return "UNKNOWN_PLANNER_FAILURE";
}

// One shared, domain-agnostic telemetry shape for every create-coordinator
// using this contract — so "planner failed silently" is never invisible in
// one domain while logged in another; the same query finds it everywhere.
export function logCreatePlanResolution(domain: string, correlationId: string, resolution: CreatePlanResolution<unknown>): void {
  console.info("[CreatePlanResolution][lifecycle]", JSON.stringify({
    domain,
    correlationId,
    source: resolution.source,
    plannerFailureReason: resolution.source === "PLANNER" ? null : resolution.plannerFailureReason,
    reliableFieldCount: resolution.source === "FALLBACK_USABLE" ? resolution.reliableFieldCount : resolution.source === "FALLBACK_EMPTY" ? 0 : null,
  }));
}
