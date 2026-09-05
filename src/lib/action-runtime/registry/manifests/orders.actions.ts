import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "orders",
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["orders.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "order.cancel",
};

export const orderActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "order.create",
    inputSchema: {
      customerId: { type: "string", required: true },
      currency: { type: "string", required: false },
      notes: { type: "string", required: false },
      deadlineAt: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "order.transitionStatus",
    inputSchema: {
      orderId: { type: "string", required: true },
      toStatus: { type: "enum", required: true, enumValues: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PLANNED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED", "CANCELLED", "ON_HOLD"] },
      reason: { type: "string", required: false },
    },
    // Was wrongly inheriting base.compensationRef ("order.cancel") —
    // cancelling the whole order does not undo a mere status transition.
    // Self-compensating instead (see order-transition-status-handler.ts).
    compensationRef: "order.transitionStatus",
  },
  {
    ...base,
    actionName: "order.cancel",
    inputSchema: {
      orderId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    // Residual Capability Parity Migration: wraps recordOrderRevision, the
    // same canonical service order-management-conversation-extension.ts's
    // QUANTITY_REVISION/DEADLINE_REVISION branches already called via PATCH
    // /api/orders/[orderId] (action: "revise"). Only QUANTITY_CHANGED/
    // DEADLINE_CHANGED exposed — ITEM_REMOVED is a real route capability
    // the extension never exposed either, not invented here.
    actionName: "order.revise",
    inputSchema: {
      orderId: { type: "string", required: true },
      changeType: { type: "enum", required: true, enumValues: ["QUANTITY_CHANGED", "DEADLINE_CHANGED"] },
      orderItemId: { type: "string", required: false },
      quantity: { type: "number", required: false },
      deadlineAt: { type: "string", required: false },
      reason: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    // Wraps recordOrderException, the same canonical service the
    // extension's EXCEPTION/SUPPLY_DELAY branches already called via PATCH
    // /api/orders/[orderId] (action: "exception").
    actionName: "order.addException",
    inputSchema: {
      orderId: { type: "string", required: true },
      category: {
        type: "enum", required: true,
        enumValues: ["CUSTOMER_HOLD_REQUEST", "PRODUCTION_STOPPED", "QUALITY_ISSUE", "SUPPLY_DELAY", "PAYMENT_HOLD", "SHIPMENT_DELAYED", "CUSTOMER_ADDRESS_CHANGED", "OTHER"],
      },
      note: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    // Wraps createOrderFromQuote (order.service.ts) — auto-derives customer
    // + line items from the won quote itself (order.create instead needs
    // an explicit customerId with no items), same canonical service the
    // extension's CONVERT_QUOTE_PATTERN branch already called via POST
    // /api/orders/from-quote.
    actionName: "order.createFromQuote",
    inputSchema: {
      quoteId: { type: "string", required: true },
    },
  },
];
