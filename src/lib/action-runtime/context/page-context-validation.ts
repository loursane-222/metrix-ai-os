import type { PageContextInput } from "./page-context.types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableNonEmptyString(value: unknown): boolean {
  return value === undefined || value === null || isNonEmptyString(value);
}

/**
 * Registry'nin kayıt-zamanı doğrulamasıyla aynı disiplin: yalnızca
 * yapısal/tip kontrolü. Hiçbir cross-field yorum, entity varlık kontrolü
 * veya iş kuralı içermez.
 */
export function collectPageContextInputValidationErrors(input: PageContextInput): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(input.module)) {
    errors.push("module is required.");
  }

  if (!isNonEmptyString(input.surface)) {
    errors.push("surface is required.");
  }

  if (!isNonEmptyString(input.route)) {
    errors.push("route is required.");
  }

  if (!isNullableNonEmptyString(input.entityType)) {
    errors.push("entityType must be null or a non-empty string.");
  }

  if (!isNullableNonEmptyString(input.entityId)) {
    errors.push("entityId must be null or a non-empty string.");
  }

  if (!isNullableNonEmptyString(input.activeTab)) {
    errors.push("activeTab must be null or a non-empty string.");
  }

  if (!isNullableNonEmptyString(input.activeForm)) {
    errors.push("activeForm must be null or a non-empty string.");
  }

  if (!isNullableNonEmptyString(input.activeDraftId)) {
    errors.push("activeDraftId must be null or a non-empty string.");
  }

  if (
    input.selection !== undefined &&
    (!Array.isArray(input.selection) || !input.selection.every((id) => isNonEmptyString(id)))
  ) {
    errors.push("selection must be an array of non-empty strings.");
  }

  return errors;
}
