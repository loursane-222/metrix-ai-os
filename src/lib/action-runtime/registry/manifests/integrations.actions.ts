import type { ActionDefinition } from "../action-registry.types";

export const integrationActionDefinitions: ActionDefinition[] = [
  {
    actionName: "integration.bizimhesap.push_invoice",
    actionClass: "DOMAIN",
    ownerModule: "integrations",
    inputSchema: {
      invoiceId: { type: "string", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["integrations.write"],
    // External, third-party accounting system side effect with no
    // documented delete/cancel endpoint — approval-gated like
    // quote.dispatch/customer.archive, not autonomous.
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
