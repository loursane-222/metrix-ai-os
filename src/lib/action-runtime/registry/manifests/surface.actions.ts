import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "surface";

/**
 * Surface Action'lar hiçbir kalıcı şirket gerçeğini değiştirmez; bu
 * yüzden requiredPermissionSet boş olabilir ve approvalPolicy hepsinde
 * NONE'dur. Field-seviyesi görünürlük/düzenlenebilirlik kontrolü Policy
 * Engine'in sorumluluğudur, bu manifestin değil.
 */
export const surfaceActionDefinitions: ActionDefinition[] = [
  {
    actionName: "draft.set_field",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      fieldName: { type: "string", required: true },
      value: { type: "json", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "draft.revert_field",
  },
  {
    actionName: "draft.clear_field",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      fieldName: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "draft.revert_field",
  },
  {
    actionName: "draft.revert_field",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      fieldName: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "draft.discard",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      draftId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "surface.navigate",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      route: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "surface.navigate",
  },
  {
    actionName: "surface.select_tab",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      tabId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "surface.select_tab",
  },
  {
    actionName: "surface.focus_field",
    actionClass: "SURFACE",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      fieldName: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
