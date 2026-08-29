import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "payments";

export const paymentActionDefinitions: ActionDefinition[] = [
  {
    actionName: "payment.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      title: { type: "string", required: true },
      amount: { type: "number", required: true },
      currency: { type: "string", required: false },
      dueDate: { type: "string", required: false },
      maturityScheduleComponent: { type: "json", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["payments.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "payment.void",
  },
  {
    actionName: "payment.void",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      paymentId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["payments.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "payment.apply",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      paymentId: { type: "string", required: true },
      amount: { type: "number", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["payments.write"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
