import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "tasks";

/**
 * task.create is LOW risk per the shared mutation risk classification: a
 * reversible draft record (title/description/dueDate/priority), no external
 * side effect, no money/stock/document dispatch involved. approvalPolicy
 * "NONE" means the explicit commit gesture already captured in the Living
 * Workspace surface (TaskCreateSurfaceRuntime) is the required confirmation
 * — no separate ApprovalRequest is created, matching customer.create's
 * identical LOW/NONE classification.
 */
export const taskActionDefinitions: ActionDefinition[] = [
  {
    actionName: "task.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      title: { type: "string", required: true },
      description: { type: "string", required: false },
      dueDate: { type: "string", required: false },
      priority: { type: "enum", required: false, enumValues: ["LOW", "MEDIUM", "HIGH"] },
      assigneeUserId: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["tasks.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: null,
  },
  {
    actionName: "task.complete", actionClass: "DOMAIN", ownerModule: OWNER_MODULE,
    inputSchema: { taskId: { type: "string", required: true } }, riskLevelBase: "LOW",
    requiredPermissionSet: ["tasks.write"], approvalPolicy: "NONE", approvalTtlClass: "STANDARD",
    isReversible: true, compensationRef: null,
  },
];
