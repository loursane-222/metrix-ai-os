import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "field_visits";

/**
 * field_visit.create is LOW risk: a purely observational log record (who
 * visited whom, when, what was said/requested) with no external side
 * effect of its own — approvalPolicy "NONE" matches customer.create/
 * task.create's identical LOW/NONE classification. Real business
 * mutations that might result from a visit (order.create, payment.create)
 * are separate actions with their own risk classification, invoked
 * independently by the field-visit conversation extension when the
 * rep's message concretely supports them.
 */
export const fieldVisitActionDefinitions: ActionDefinition[] = [
  {
    actionName: "field_visit.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: false },
      customerNameRaw: { type: "string", required: true },
      contactNameRaw: { type: "string", required: false },
      startAt: { type: "string", required: true },
      endAt: { type: "string", required: false },
      notes: { type: "string", required: false },
      requestTypes: { type: "json", required: false },
      unresolvedIntent: { type: "string", required: false },
      relatedOrderId: { type: "string", required: false },
      relatedPaymentId: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["field_visits.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
