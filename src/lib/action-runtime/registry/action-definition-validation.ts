import type { ActionDefinition, ActionInputFieldType } from "./action-registry.types";

const ACTION_CLASSES = new Set(["SURFACE", "DOMAIN"]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
const APPROVAL_POLICIES = new Set(["NONE", "EXPLICIT", "CONDITIONAL"]);
const APPROVAL_TTL_CLASSES = new Set(["SHORT", "STANDARD", "EXTENDED"]);
const INPUT_FIELD_TYPES = new Set<ActionInputFieldType>(["string", "number", "boolean", "enum", "json"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function collectInputSchemaErrors(inputSchema: unknown): string[] {
  if (typeof inputSchema !== "object" || inputSchema === null || Array.isArray(inputSchema)) {
    return ["inputSchema must be a plain object."];
  }

  const errors: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(inputSchema as Record<string, unknown>)) {
    if (typeof fieldSchema !== "object" || fieldSchema === null) {
      errors.push(`inputSchema.${fieldName} must be an object.`);
      continue;
    }

    const { type, required, enumValues } = fieldSchema as Record<string, unknown>;

    if (!INPUT_FIELD_TYPES.has(type as ActionInputFieldType)) {
      errors.push(`inputSchema.${fieldName}.type is invalid.`);
    }

    if (typeof required !== "boolean") {
      errors.push(`inputSchema.${fieldName}.required must be a boolean.`);
    }

    if (type === "enum" && (!Array.isArray(enumValues) || enumValues.length === 0)) {
      errors.push(`inputSchema.${fieldName}.enumValues is required for enum fields.`);
    }
  }

  return errors;
}

/**
 * Registry'nin kayıt sırasında uyguladığı tek doğrulama katmanı.
 * Yalnızca yapısal/tip metadata'yı kontrol eder — hiçbir iş kuralı,
 * cross-field yorumu veya harici referans doğrulaması yapmaz.
 */
export function collectActionDefinitionValidationErrors(definition: ActionDefinition): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(definition.actionName)) {
    errors.push("actionName is required.");
  }

  if (!ACTION_CLASSES.has(definition.actionClass)) {
    errors.push("actionClass must be SURFACE or DOMAIN.");
  }

  if (!isNonEmptyString(definition.ownerModule)) {
    errors.push("ownerModule is required.");
  }

  errors.push(...collectInputSchemaErrors(definition.inputSchema));

  if (!RISK_LEVELS.has(definition.riskLevelBase)) {
    errors.push("riskLevelBase must be LOW, MEDIUM or HIGH.");
  }

  if (
    !Array.isArray(definition.requiredPermissionSet) ||
    !definition.requiredPermissionSet.every((permission) => isNonEmptyString(permission))
  ) {
    errors.push("requiredPermissionSet must be an array of non-empty strings.");
  }

  if (!APPROVAL_POLICIES.has(definition.approvalPolicy)) {
    errors.push("approvalPolicy must be NONE, EXPLICIT or CONDITIONAL.");
  }

  if (!APPROVAL_TTL_CLASSES.has(definition.approvalTtlClass)) {
    errors.push("approvalTtlClass must be SHORT, STANDARD or EXTENDED.");
  }

  if (typeof definition.isReversible !== "boolean") {
    errors.push("isReversible must be a boolean.");
  }

  if (definition.compensationRef !== null && !isNonEmptyString(definition.compensationRef)) {
    errors.push("compensationRef must be null or a non-empty string.");
  }

  return errors;
}
