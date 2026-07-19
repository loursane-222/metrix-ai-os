import { canAccessField, normalizeFieldValue, type FieldAuthorityContext, type ModuleFieldDefinition } from "./field-authority";
export type FieldAuthorityDraft = { values: Record<string, unknown>; baseline: Record<string, unknown>; dirty: string[]; errors: Record<string, string>; revision: number };
export type FieldDraftOperation = { kind: "set_field" | "set_nested_field" | "set_custom_field"; fieldId: string; value: unknown; nestedKey?: string } | { kind: "clear_field" | "clear_nested_field" | "clear_custom_field"; fieldId: string; nestedKey?: string } | { kind: "validate" } | { kind: "reset" } | { kind: "rebase"; values: Record<string, unknown> };
export function createFieldAuthorityDraft(values: Record<string, unknown> = {}): FieldAuthorityDraft { return { values: structuredClone(values), baseline: structuredClone(values), dirty: [], errors: {}, revision: 0 }; }
export function applyFieldDraftOperation(draft: FieldAuthorityDraft, operation: FieldDraftOperation, fields: readonly ModuleFieldDefinition[], context: FieldAuthorityContext): FieldAuthorityDraft {
  if (operation.kind === "reset") return createFieldAuthorityDraft(draft.baseline);
  if (operation.kind === "rebase") return createFieldAuthorityDraft(operation.values);
  const byId = new Map(fields.map((field) => [field.fieldId, field]));
  if (operation.kind === "validate") return validateFieldAuthorityDraft(draft, fields, context.operation);
  const field = byId.get(operation.fieldId); if (!field) throw new Error("UNKNOWN_FIELD_ID"); const authority = canAccessField(field, context); if (!authority.writable) throw new Error(authority.reason);
  const values = structuredClone(draft.values); let next: unknown;
  if (operation.kind.startsWith("clear")) { if (!field.clearable) throw new Error("FIELD_NOT_CLEARABLE"); next = null; }
  else next = normalizeFieldValue(field, "value" in operation ? operation.value : undefined);
  values[field.fieldId] = next;
  return { ...draft, values, dirty: [...new Set([...draft.dirty, field.fieldId])], errors: { ...draft.errors, [field.fieldId]: "" }, revision: draft.revision + 1 };
}
export function validateFieldAuthorityDraft(draft: FieldAuthorityDraft, fields: readonly ModuleFieldDefinition[], operation: "create" | "update" | "read"): FieldAuthorityDraft {
  const errors: Record<string, string> = {};
  for (const field of fields) { const required = operation === "create" ? field.requiredOnCreate : field.requiredOnUpdate; const value = draft.values[field.fieldId]; if (required && (value === undefined || value === null || value === "")) errors[field.fieldId] = "Zorunlu alan."; else if (value !== undefined && value !== null) { try { normalizeFieldValue(field, value); } catch (error) { errors[field.fieldId] = error instanceof Error ? error.message : "Geçersiz değer."; } } }
  return { ...draft, errors };
}
