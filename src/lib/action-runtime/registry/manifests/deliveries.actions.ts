import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "deliveries",
  inputSchema: {},
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["deliveries.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "delivery.cancel",
};

export const deliveryActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "delivery.create",
    // Matches handleDeliveryCreate's real contract (delivery-create-handler.ts)
    // — previously an empty placeholder schema, which silently excluded this
    // action from any schema-driven consumer (e.g. the general orchestration
    // planner, which only considers actions with a non-empty inputSchema).
    inputSchema: {
      sourceOrderId: { type: "string", required: true },
      customerId: { type: "string", required: true },
      warehouse: { type: "string", required: false },
      dispatchPoint: { type: "string", required: false },
      deliveryAddress: { type: "string", required: false },
      carrier: { type: "string", required: false },
      notes: { type: "string", required: false },
    },
  },
  { ...base, actionName: "delivery.transitionStatus" },
  {
    ...base,
    actionName: "delivery.cancel",
    // Previously the shared empty base.inputSchema ({}) — no handler was
    // registered for this action either, so a real compensating call
    // (order.create → delivery.create → delivery.cancel) had no working
    // target. See register-delivery-actions.ts/delivery-cancel-handler.ts.
    inputSchema: {
      deliveryId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    compensationRef: null,
    isReversible: false,
  },
];
