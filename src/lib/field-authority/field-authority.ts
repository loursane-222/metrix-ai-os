export const MODULE_FIELD_VALUE_TYPES = ["string", "multiline_string", "phone", "email", "integer", "money", "percentage", "boolean", "date", "datetime", "enum", "address", "contact", "json"] as const;
export type ModuleFieldValueType = (typeof MODULE_FIELD_VALUE_TYPES)[number];
export type FieldAuthorityOperation = "create" | "update" | "read";
export type ModuleFieldDefinition = {
  fieldId: string; module: string; entityType: string; key: string; label: string; description: string;
  valueType: ModuleFieldValueType; storageKind: "scalar" | "json" | "relation" | "commercial_terms" | "custom_value";
  requiredOnCreate: boolean; requiredOnUpdate: boolean; readable: boolean; writable: boolean; clearable: boolean;
  searchable: boolean; filterable: boolean; sortable: boolean; reportable: boolean;
  sourceOfTruth: "entity" | "relation" | "system"; sensitivity: "PUBLIC" | "INTERNAL" | "SENSITIVE";
  riskLevel: "LOW" | "MEDIUM" | "HIGH"; approvalPolicy: "NONE" | "EXPLICIT";
  permissionRead: string; permissionWrite: string | null; validation?: { min?: number; max?: number; pattern?: string; options?: string[] };
  normalization?: "trim" | "email" | "currency" | "integer" | "money_cents" | "percentage_basis_points";
  defaultValue?: unknown; nestedPath?: string[]; uiSection: string; uiOrder: number;
  custom: boolean; state: "ACTIVE" | "DEPRECATED"; aliases?: string[];
};
export type FieldAuthorityContext = { permissions: readonly string[]; operation: FieldAuthorityOperation };

export function validateModuleFieldRegistry(fields: readonly ModuleFieldDefinition[]): string[] {
  const errors: string[] = []; const ids = new Set<string>(); const keys = new Set<string>();
  for (const field of fields) {
    if (!/^[A-Za-z0-9_.-]+$/.test(field.fieldId)) errors.push(`Invalid fieldId: ${field.fieldId}`);
    if (ids.has(field.fieldId)) errors.push(`Duplicate fieldId: ${field.fieldId}`); ids.add(field.fieldId);
    const scopedKey = `${field.module}:${field.entityType}:${field.key}`; if (keys.has(scopedKey)) errors.push(`Duplicate key: ${field.key}`); keys.add(scopedKey);
    if (field.requiredOnCreate && (!field.writable || field.clearable)) errors.push(`Required create field must be writable and not clearable: ${field.fieldId}`);
    if (!field.readable && field.permissionRead !== "server-only") errors.push(`Hidden field must be server-only: ${field.fieldId}`);
  }
  return errors;
}

export function canAccessField(field: ModuleFieldDefinition, context: FieldAuthorityContext): { readable: boolean; writable: boolean; reason?: string } {
  const permissions = new Set(context.permissions);
  const readable = field.readable && (field.permissionRead === "public" || permissions.has(field.permissionRead));
  const writable = field.writable && field.permissionWrite !== null && permissions.has(field.permissionWrite) && context.operation !== "read";
  return { readable, writable, ...(!writable && context.operation !== "read" ? { reason: "FIELD_NOT_WRITABLE" } : {}) };
}

export function normalizeFieldValue(field: ModuleFieldDefinition, value: unknown): unknown {
  if (value === null) return null;
  if (field.valueType === "boolean") { if (typeof value !== "boolean") throw new Error(`${field.fieldId} must be boolean.`); return value; }
  if (["integer", "money", "percentage"].includes(field.valueType)) {
    const parsed = field.valueType === "money" ? parseMoney(value) : typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed)) throw new Error(`${field.fieldId} must be numeric.`);
    const normalized = field.normalization === "money_cents" ? Math.round(parsed * 100) : field.normalization === "percentage_basis_points" ? Math.round(parsed * 100) : Math.trunc(parsed);
    if (field.validation?.min !== undefined && normalized < field.validation.min) throw new Error(`${field.fieldId} is below minimum.`);
    if (field.validation?.max !== undefined && normalized > field.validation.max) throw new Error(`${field.fieldId} is above maximum.`);
    return normalized;
  }
  if (field.valueType === "address" || field.valueType === "contact" || field.valueType === "json") { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field.fieldId} must be an object.`); return value; }
  if (typeof value !== "string") throw new Error(`${field.fieldId} must be a string.`);
  const normalized = field.normalization === "email" ? value.trim().toLowerCase() : field.normalization === "currency" ? value.trim().toUpperCase() : value.trim();
  if (field.validation?.options && !field.validation.options.includes(normalized)) throw new Error(`${field.fieldId} has an invalid option.`);
  if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(normalized)) throw new Error(`${field.fieldId} has invalid format.`);
  return normalized;
}

function parseMoney(value: unknown): number { if (typeof value === "number") return value; const text = String(value).trim().toLocaleLowerCase("tr-TR").replace(/(?:₺|tl|try|lira|usd|eur|gbp)/g, "").trim(); const multiplier = /\bmilyon\b/.test(text) ? 1_000_000 : /\bbin\b/.test(text) ? 1_000 : 1; const numeric = Number(text.replace(/\b(?:bin|milyon)\b/g, "").replace(/\s/g, "").replace(",", ".")); return numeric * multiplier; }

export function mergeCustomFieldDefinitions(builtIns: readonly ModuleFieldDefinition[], customFields: readonly ModuleFieldDefinition[]): ModuleFieldDefinition[] {
  const merged = [...builtIns, ...customFields]; const errors = validateModuleFieldRegistry(merged); if (errors.length) throw new Error(errors.join(" ")); return merged.filter((field) => field.state === "ACTIVE");
}
