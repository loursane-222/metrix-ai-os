import type { OrchestrationPlan } from "./executive-orchestration.types";

// The only two actions with a real, external, third-party side effect that
// no METRIX action can undo: quote.dispatch sends a real customer email;
// integration.bizimhesap.push_invoice pushes to BizimHesap's external API,
// which has no documented delete/cancel endpoint. Every other action in the
// registry now carries a working compensator (see compensation.ts) — these
// two structurally can't. The only honest way to guarantee a plan never
// needs to compensate one of them is to never let one be a non-final step.
const IRREVERSIBLE_ACTION_NAMES = new Set(["quote.dispatch", "integration.bizimhesap.push_invoice"]);

export type PlanValidationResult = Readonly<{ valid: true }> | Readonly<{ valid: false; reason: string }>;

// Rejects rather than silently reorders: reordering risks breaking a
// $stepRef a later step depends on, and changes the user's stated intent
// without their knowledge. A plan placing an irreversible action anywhere
// but last is invalid and must be reported back, not "fixed" quietly.
export function validatePlanIrreversibleOrdering(plan: OrchestrationPlan): PlanValidationResult {
  const lastIndex = plan.steps.length - 1;
  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index]!;
    if (IRREVERSIBLE_ACTION_NAMES.has(step.actionName) && index !== lastIndex) {
      return {
        valid: false,
        reason: `"${step.actionName}" geri alınamaz bir işlemdir ve yalnızca planın son adımı olabilir — bu planda ${lastIndex - index} adım sonrasında daha fazla adım var.`,
      };
    }
  }
  return { valid: true };
}
