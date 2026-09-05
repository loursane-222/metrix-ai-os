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
  {
    ...base,
    actionName: "delivery.transitionStatus",
    // Previously the shared empty base.inputSchema ({}) — no handler was
    // registered either. See delivery-transition-status-handler.ts.
    inputSchema: {
      deliveryId: { type: "string", required: true },
      toStatus: {
        type: "enum", required: true,
        enumValues: ["DRAFT", "PREPARING", "PICKING", "PACKING", "LOADED", "DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED", "CANCELLED"],
      },
      reason: { type: "string", required: false },
    },
  },
  {
    ...base,
    // Residual Capability Parity Migration: wraps createDeliveryFromOrder
    // (delivery.service.ts) — auto-derives customer + shippable line items
    // from the source order itself (delivery.create instead needs an
    // explicit customerId), same canonical service
    // delivery-management-conversation-extension.ts's CREATE_FROM_ORDER
    // branch already called via POST /api/deliveries/from-order.
    actionName: "delivery.createFromOrder",
    inputSchema: {
      sourceOrderId: { type: "string", required: true },
      autoDispatch: { type: "boolean", required: false },
    },
  },
  {
    ...base,
    // Residual Capability Parity Migration: wraps recordProofOfDelivery,
    // the same canonical service delivery-management-conversation-
    // extension.ts's PROOF_CODE/PROOF_RECEIVER branches already called via
    // PATCH /api/deliveries/[deliveryId] (action: "proof").
    actionName: "delivery.recordProof",
    inputSchema: {
      deliveryId: { type: "string", required: true },
      confirmationCode: { type: "string", required: false },
      receiverName: { type: "string", required: false },
      note: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    // Wraps recordDeliveryException, the same canonical service the
    // extension's EXCEPTION/CUSTOMER_ABSENT branches already called via
    // PATCH /api/deliveries/[deliveryId] (action: "exception").
    actionName: "delivery.addException",
    inputSchema: {
      deliveryId: { type: "string", required: true },
      category: {
        type: "enum", required: true,
        enumValues: ["CUSTOMER_NOT_AT_ADDRESS", "DELIVERY_REFUSED", "PRODUCT_DAMAGED", "VEHICLE_BREAKDOWN", "WRONG_ADDRESS", "SHORTAGE_FOUND", "DELIVERY_POSTPONED", "OTHER"],
      },
      note: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
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
