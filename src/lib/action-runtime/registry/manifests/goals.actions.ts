import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "goals";

/**
 * Goal (SalesGoal) domaini önceden Action Registry'de hiç yoktu — yalnızca
 * legacy HTTP route + authorizeLegacyMutation ile korunuyordu (kanıtlanmış
 * tam bypass, bkz. proje checkpoint'i Faz 1). requiredPermissionSet burada
 * PATCH /api/goals/[goalId]'in kullandığı gerçek permission ile birebir
 * aynıdır ("goals.write") — approval/permission boundary değişmez.
 */
export const goalActionDefinitions: ActionDefinition[] = [
  {
    actionName: "goal.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      title: { type: "string", required: true },
      period: { type: "enum", required: true, enumValues: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] },
      scope: { type: "enum", required: false, enumValues: ["COMPANY", "TEAM", "PERSON", "CUSTOMER_SEGMENT", "PRODUCT", "BRANCH"] },
      goalType: { type: "enum", required: false, enumValues: ["SALES", "COLLECTION", "REVENUE", "GROSS_PROFIT", "NEW_CUSTOMER", "ACTIVITY", "CUSTOM"] },
      targetRevenueCents: { type: "number", required: false },
      targetCollectionCents: { type: "number", required: false },
      targetValue: { type: "number", required: false },
      currency: { type: "string", required: false },
      startsAt: { type: "string", required: false },
      endsAt: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["goals.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "goal.archive",
  },
  {
    actionName: "goal.update",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      goalId: { type: "string", required: true },
      title: { type: "string", required: false },
      period: { type: "enum", required: false, enumValues: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] },
      targetRevenueCents: { type: "number", required: false },
      targetCollectionCents: { type: "number", required: false },
      startsAt: { type: "string", required: false },
      endsAt: { type: "string", required: false },
      status: { type: "enum", required: false, enumValues: ["ACTIVE", "COMPLETED", "CANCELLED"] },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["goals.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "goal.update",
  },
  {
    actionName: "goal.archive",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      goalId: { type: "string", required: true },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["goals.archive"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
