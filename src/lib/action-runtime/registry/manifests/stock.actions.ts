import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "stock",
  inputSchema: {},
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["stock.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "stock.adjustment",
};

export const stockActionDefinitions: ActionDefinition[] = [
  { ...base, actionName: "stock.receive" },
  { ...base, actionName: "stock.transfer" },
  { ...base, actionName: "stock.adjustment", compensationRef: null, isReversible: false },
  { ...base, actionName: "warehouse.create" },
];
