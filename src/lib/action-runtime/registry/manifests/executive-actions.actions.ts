import type { ActionDefinition } from "../action-registry.types";

export const executiveActionDefinitions: ActionDefinition[] = [{
  actionName: "executive_action.complete",
  actionClass: "DOMAIN",
  ownerModule: "executive-actions",
  inputSchema: {
    executiveActionId: { type: "string", required: true },
    outcomeStatus: {
      type: "enum",
      required: true,
      enumValues: ["SUCCESS", "PARTIAL", "FAILED", "UNKNOWN"],
    },
    resultSummary: { type: "string", required: false },
  },
  riskLevelBase: "HIGH",
  requiredPermissionSet: ["executive_actions.write"],
  approvalPolicy: "EXPLICIT",
  approvalTtlClass: "SHORT",
  isReversible: false,
  compensationRef: null,
}];
