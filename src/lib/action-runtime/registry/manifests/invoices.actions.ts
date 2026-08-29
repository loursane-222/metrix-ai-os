import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "invoices";

/**
 * invoice.create is LOW risk per the same classification task.create and
 * customer.create use: this action only ever produces an internal DRAFT
 * Invoice record (no e-Fatura submission, no external dispatch, no money
 * movement — those are separate, not-yet-built capabilities). approvalPolicy
 * "NONE" means the explicit conversational commit is the required
 * confirmation, matching task.create's identical reasoning. If a future
 * operation adds a real SENT/dispatch transition (comparable to
 * quote.send/quote.dispatch), that action gets its own, stricter
 * classification then — this one does not need to anticipate it now.
 */
export const invoiceActionDefinitions: ActionDefinition[] = [
  {
    actionName: "invoice.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      title: { type: "string", required: true },
      amount: { type: "number", required: true },
      quoteId: { type: "string", required: false },
      taxRate: { type: "number", required: false },
      currency: { type: "string", required: false },
      invoiceNumber: { type: "string", required: false },
      dueDate: { type: "string", required: false },
      paymentTermSnapshot: { type: "json", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "invoice.void",
  },
  {
    actionName: "invoice.void",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      invoiceId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "invoice.send",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      invoiceId: { type: "string", required: true },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
