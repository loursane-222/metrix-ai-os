import { executeCompanyQueryPlan, type CompanyQueryPlan } from "@/lib/company-query-authority";
import { registerCapability } from "../capability-registry";

/**
 * The canonical READ seam for Company Query Authority — the compositional
 * ceiling above the closed managementIntent union (cross-domain set
 * composition, single-customer fact bundles like "Atlas'ın borcu ne?",
 * historical conversation retrieval). payload carries `{ plan, now,
 * timeZone, conversationId }` because executeCompanyQueryPlan needs a
 * server clock/timezone/conversation context alongside the plan itself —
 * nested under `plan` so it never collides with the plan's own fields.
 * This wraps the real, existing executeCompanyQueryPlan — it invents no
 * query logic of its own.
 */
export function registerCompanyQueryCapability(): void {
  registerCapability({
    capabilityId: "company.query",
    domain: "company",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async () => null,
      search: async (organizationId, payload) => {
        const plan = payload.plan as CompanyQueryPlan;
        const now = typeof payload.now === "string" ? new Date(payload.now) : new Date();
        const timeZone = typeof payload.timeZone === "string" ? payload.timeZone : "Europe/Istanbul";
        const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
        return executeCompanyQueryPlan(organizationId, plan, { now, timeZone, conversationId });
      },
    },
  });
}
