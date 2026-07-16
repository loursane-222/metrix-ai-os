/**
 * Executive Action Runtime — Executive Action Registry çekirdeği.
 *
 * Registry, Surface ve Domain eylemlerin typed metadata'sını tutar.
 * Hiçbir eylemi çalıştırmaz, hiçbir handler/repository bilmez.
 */

export type ActionClass = "SURFACE" | "DOMAIN";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ApprovalPolicy = "NONE" | "EXPLICIT" | "CONDITIONAL";

export type ApprovalTtlClass = "SHORT" | "STANDARD" | "EXTENDED";

export type ActionInputFieldType = "string" | "number" | "boolean" | "enum" | "json";

export type ActionInputFieldSchema = {
  type: ActionInputFieldType;
  required: boolean;
  enumValues?: readonly string[];
};

export type ActionInputSchema = Record<string, ActionInputFieldSchema>;

export interface ActionDefinition {
  actionName: string;
  actionClass: ActionClass;
  ownerModule: string;
  inputSchema: ActionInputSchema;
  riskLevelBase: RiskLevel;
  requiredPermissionSet: readonly string[];
  approvalPolicy: ApprovalPolicy;
  approvalTtlClass: ApprovalTtlClass;
  isReversible: boolean;
  compensationRef: string | null;
}
