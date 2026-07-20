import { canAccessField, type FieldAuthorityContext, type ModuleFieldDefinition } from "@/lib/field-authority/field-authority";
import type { FieldHint, FieldResolutionStatus } from "./contracts";
export type FieldResolution = Readonly<{ status: FieldResolutionStatus; field?: ModuleFieldDefinition; candidates: readonly string[]; reason: string }>;
const norm = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/[._-]/g, " ").replace(/\s+/g, " ");
export function resolveField(hint: FieldHint, fields: readonly ModuleFieldDefinition[], context: FieldAuthorityContext, scope: Readonly<{ module?: string; entityType: string }>): FieldResolution {
  const scoped = fields.filter((field) => field.entityType === scope.entityType && (!scope.module || field.module === scope.module));
  const matches = hint.fieldId ? scoped.filter((field) => field.fieldId === hint.fieldId) : hint.key ? scoped.filter((field) => norm(field.key) === norm(hint.key!)) : hint.label ? scoped.filter((field) => norm(field.label) === norm(hint.label!) || (field.aliases ?? []).some((alias) => norm(alias) === norm(hint.label!))) : [];
  if (!matches.length) return { status: "UNKNOWN", candidates: [], reason: "FIELD_NOT_IN_REGISTRY" };
  if (matches.length > 1) return { status: "AMBIGUOUS", candidates: matches.map((field) => field.fieldId), reason: "FIELD_ALIAS_AMBIGUOUS" };
  const field = matches[0]!; if (field.state === "DEPRECATED") return { status: "DEPRECATED", field, candidates: [field.fieldId], reason: "FIELD_DEPRECATED" };
  if (!field.writable) return { status: "READ_ONLY", field, candidates: [field.fieldId], reason: "FIELD_READ_ONLY" };
  if (!canAccessField(field, context).writable) return { status: "FORBIDDEN", field, candidates: [field.fieldId], reason: "FIELD_PERMISSION_DENIED" };
  if (hint.valueType && hint.valueType !== field.valueType) return { status: "TYPE_INCOMPATIBLE", field, candidates: [field.fieldId], reason: "FIELD_TYPE_MISMATCH" };
  return { status: "RESOLVED", field, candidates: [field.fieldId], reason: "FIELD_RESOLVED" };
}
