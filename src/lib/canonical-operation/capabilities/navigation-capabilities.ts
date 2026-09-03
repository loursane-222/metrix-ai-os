import { DOMAIN_RULES, type WorkspaceDomain } from "@/lib/living-workspace/contracts";
import { registerCapability, type CapabilityDescriptor } from "../capability-registry";

/**
 * NAVIGATION capabilities are deliberately thin: they only carry the target
 * route from the existing DOMAIN_RULES table (living-workspace/contracts.ts)
 * so native-connector.ts can express "this operation's entity can be
 * revealed, and here is where". Building the actual WorkspaceDirective
 * (surfaces, columns, filters) stays the job of living-workspace/planner.ts
 * and the per-domain planners that already exist — this registry does not
 * replace them, only expresses the reveal decision.
 */
const CANONICAL_DOMAIN_TO_WORKSPACE_DOMAIN: Record<string, WorkspaceDomain> = {
  customer: "customer",
  quote: "offer",
  order: "order",
  invoice: "invoice",
  settlement: "payment",
  task: "task",
  stock: "stock",
  calendar: "calendar",
  team: "team",
};

export function registerNavigationCapabilities(): void {
  for (const [domain, workspaceDomain] of Object.entries(CANONICAL_DOMAIN_TO_WORKSPACE_DOMAIN)) {
    const descriptor: CapabilityDescriptor = {
      capabilityId: `${domain}.navigate`,
      domain,
      classification: "NAVIGATION",
      implementation: { kind: "NAVIGATION", route: DOMAIN_RULES[workspaceDomain].routes[0]! },
    };
    registerCapability(descriptor);
  }
}
