import type { ActionInputSchema } from "../registry/action-registry.types";

/**
 * Registry'nin ActionDefinition.inputSchema'sına karşı yapısal/tip
 * doğrulaması. Hiçbir iş kuralı içermez — yalnızca required/type/enum
 * kontrolü.
 */
export function validateInputAgainstSchema(schema: ActionInputSchema, input: Record<string, unknown>): string[] {
  const errors: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = input[fieldName];
    const isMissing = value === undefined || value === null;

    if (fieldSchema.required && isMissing) {
      errors.push(`${fieldName} is required.`);
      continue;
    }

    if (isMissing) {
      continue;
    }

    switch (fieldSchema.type) {
      case "string":
        if (typeof value !== "string") {
          errors.push(`${fieldName} must be a string.`);
        }
        break;
      case "number":
        if (typeof value !== "number") {
          errors.push(`${fieldName} must be a number.`);
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`${fieldName} must be a boolean.`);
        }
        break;
      case "enum":
        if (!fieldSchema.enumValues || !fieldSchema.enumValues.includes(value as string)) {
          errors.push(`${fieldName} must be one of: ${(fieldSchema.enumValues ?? []).join(", ")}.`);
        }
        break;
      case "json":
        break;
    }
  }

  return errors;
}
