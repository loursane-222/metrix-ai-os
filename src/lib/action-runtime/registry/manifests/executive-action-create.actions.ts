import type { ActionDefinition } from "../action-registry.types";

export const executiveActionCreateDefinitions: ActionDefinition[] = [{
  actionName: "executive_action.create",
  actionClass: "DOMAIN",
  ownerModule: "executive-actions",
  inputSchema: {
    candidateId: { type: "string", required: true },
    title: { type: "string", required: true },
    reason: { type: "string", required: true },
    dueDate: { type: "string", required: false },
    ownerType: { type: "enum", required: true, enumValues: ["USER", "PERSON", "UNASSIGNED"] },
    ownerId: { type: "string", required: false },
  },
  riskLevelBase: "LOW",
  requiredPermissionSet: ["executive_actions.write"],
  approvalPolicy: "NONE",
  approvalTtlClass: "STANDARD",
  isReversible: true,
  compensationRef: null,
}];
