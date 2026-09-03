import type { LastSuccessfulOperationContext } from "@/lib/conversations/last-operation-context";
import { bootstrapCapabilityRegistry } from "./capabilities";
import { getCapability } from "./capability-registry";

export type ContinuityEntityResolution =
  | Readonly<{ status: "RESOLVED"; entityType: string; entityId: string; source: "EXPLICIT" | "CONTINUITY" }>
  | Readonly<{ status: "NOT_APPLICABLE" }>
  | Readonly<{ status: "CLARIFICATION_REQUIRED"; reason: string }>;

/**
 * Domain-generic cross-turn entity continuity for CanonicalOperationV1
 * compilation. No utterance-specific phrasing lives here — the caller has
 * already decided (via its own entity-resolution/typed-parsing, whatever
 * that looks like per domain/capability) whether the CURRENT turn carries
 * an explicit entity reference. This function only answers: given that it
 * doesn't, is it SAFE to reuse the last successful canonical operation's
 * entity?
 *
 * Safety rules (all generic, capability/domain-driven — never a phrase list):
 * 1. An explicit reference on the current turn always wins outright — this
 *    function is never even consulted in that case (see explicitEntityId
 *    param: passing one here short-circuits to EXPLICIT).
 * 2. The prior context is only reused if the CAPABILITY being compiled now
 *    targets the SAME entityType the prior context recorded (a
 *    customer.update turn can reuse a customer context; it can never reuse
 *    a calendar_event context — no cross-domain guessing).
 * 3. buildLastSuccessfulOperationContext (last-operation-context.ts) already
 *    gates prior context construction to EXECUTED + mutationPerformed
 *    handoffs — a FAILED/CONFLICT/UNSUPPORTED/APPROVAL_REQUIRED turn never
 *    produces one, so this function can never inherit a stale "success".
 * 4. No prior context, or a capability unknown to the registry, or a
 *    domain/entityType mismatch: CLARIFICATION_REQUIRED, never a guess.
 */
export function resolveContinuityEntity(input: {
  explicitEntityId: string | null;
  capability: string;
  previousContext: LastSuccessfulOperationContext | null;
}): ContinuityEntityResolution {
  bootstrapCapabilityRegistry();
  if (input.explicitEntityId) {
    return { status: "RESOLVED", entityType: entityTypeForCapability(input.capability), entityId: input.explicitEntityId, source: "EXPLICIT" };
  }
  if (!input.previousContext) return { status: "NOT_APPLICABLE" };

  const descriptor = getCapability(input.capability);
  if (!descriptor) return { status: "NOT_APPLICABLE" };

  // previousContext.domain is the ConversationExtensionHandoff's own
  // domain vocabulary (e.g. "customers", "quotes" — see
  // last-operation-context.ts); the capability registry's domain vocabulary
  // is singular business-semantic (e.g. "customer", "quote"). Compare via
  // the capability's own entityType, not a hand-maintained mapping table.
  const targetEntityType = entityTypeForCapability(input.capability);
  const previousEntityType = handoffDomainToEntityType(input.previousContext.domain);
  if (!previousEntityType || previousEntityType !== targetEntityType) {
    return { status: "CLARIFICATION_REQUIRED", reason: `Bu işlem "${targetEntityType}" türünde bir kayıt gerektiriyor; son işlem "${input.previousContext.domain}" türündeydi.` };
  }

  return { status: "RESOLVED", entityType: targetEntityType, entityId: input.previousContext.entityId, source: "CONTINUITY" };
}

function entityTypeForCapability(capability: string): string {
  const descriptor = getCapability(capability);
  if (descriptor?.domain) return descriptor.domain;
  return capability.split(".")[0] ?? "unknown";
}

// ConversationExtensionHandoff domains are the plural REST-ish vocabulary
// used across conversation-extensions (customers/quotes/tasks/...) —
// mapped to the capability registry's singular business-domain vocabulary.
// Extend this table only when a new domain's handoff is wired into
// last-operation-context.ts; it is not itself an NLU/phrase mechanism.
const HANDOFF_DOMAIN_TO_ENTITY_TYPE: Readonly<Record<string, string>> = {
  customers: "customer",
  quotes: "quote",
  orders: "order",
  invoices: "invoice",
  tasks: "task",
  stocks: "stock",
  calendar: "calendar",
  team: "team",
  suppliers: "supplier",
  products: "product",
  goals: "goal",
  deliveries: "delivery",
  payments: "payment",
};

function handoffDomainToEntityType(domain: string): string | null {
  return HANDOFF_DOMAIN_TO_ENTITY_TYPE[domain] ?? null;
}
