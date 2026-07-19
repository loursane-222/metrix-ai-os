import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import { CUSTOMER_BUILT_IN_FIELDS, customerCustomDefinitionToField } from "@/lib/customers/customer-field-registry";
import { MODULE_FIELD_VALUE_TYPES, normalizeFieldValue, type ModuleFieldDefinition, type ModuleFieldValueType } from "./field-authority";

export type CustomFieldDefinitionDraft = {
  module: "customers"; entityType: "customer"; key: string; label: string; description?: string;
  valueType: ModuleFieldValueType; required?: boolean; options?: string[]; defaultValue?: unknown;
  validation?: Record<string, unknown>; searchable?: boolean; filterable?: boolean; reportable?: boolean;
  uiSection?: string; uiOrder?: number;
};
export type CreateCustomFieldDefinitionInput = CustomFieldDefinitionDraft & { organizationId: string; actorId: string };
export type UpdateCustomFieldDefinitionInput = Partial<Omit<CustomFieldDefinitionDraft, "module" | "entityType" | "key" | "valueType">> & { organizationId: string; actorId: string; definitionId: string };

const RESERVED_KEYS = new Set(CUSTOMER_BUILT_IN_FIELDS.flatMap((field) => [field.key.toLocaleLowerCase("tr-TR"), field.fieldId.replace(/^customer\./, "").toLocaleLowerCase("tr-TR")]));
const CUSTOM_VALUE_TYPES: readonly ModuleFieldValueType[] = ["string", "multiline_string", "phone", "email", "integer", "money", "percentage", "boolean", "date", "datetime", "enum"];

export function normalizeCustomFieldKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export function validateCustomFieldDefinition(input: CustomFieldDefinitionDraft): string[] {
  const errors: string[] = [];
  if (input.module !== "customers" || input.entityType !== "customer") errors.push("Unsupported module or entity type.");
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.key)) errors.push("key must be stable lower_snake_case.");
  if (RESERVED_KEYS.has(input.key.toLocaleLowerCase("tr-TR"))) errors.push("CUSTOM_FIELD_KEY_RESERVED");
  if (!input.label.trim() || input.label.trim().length > 100) errors.push("label is invalid.");
  if (input.description && input.description.trim().length > 500) errors.push("description is too long.");
  if (!MODULE_FIELD_VALUE_TYPES.includes(input.valueType) || !CUSTOM_VALUE_TYPES.includes(input.valueType)) errors.push("valueType is invalid.");
  if (input.valueType === "enum" && (!input.options || input.options.length < 2 || input.options.length > 50 || input.options.some((x) => !x.trim() || x.length > 80) || new Set(input.options.map((x) => x.toLocaleLowerCase("tr-TR"))).size !== input.options.length)) errors.push("enum options must contain unique bounded values.");
  if (input.valueType !== "enum" && input.options?.length) errors.push("options are only allowed for enum fields.");
  if (input.uiSection && input.uiSection !== "Özel Alanlar") errors.push("uiSection is not allowed.");
  if (input.uiOrder !== undefined && (!Number.isInteger(input.uiOrder) || input.uiOrder < 0 || input.uiOrder > 10000)) errors.push("uiOrder is invalid.");
  if (input.defaultValue !== undefined) {
    try { normalizeDraftValue(input, input.defaultValue); } catch { errors.push("defaultValue is invalid."); }
  }
  return errors;
}
export function requestCustomFieldDefinitionChange(input: CreateCustomFieldDefinitionInput) { const normalized = { ...input, key: normalizeCustomFieldKey(input.key) }; const errors = validateCustomFieldDefinition(normalized); if (errors.length) return { status: "REJECTED" as const, errors }; return { status: "APPROVAL_REQUIRED" as const, approvalPolicy: "EXPLICIT" as const, riskLevel: "HIGH" as const, preview: { key: normalized.key, label: normalized.label, valueType: normalized.valueType, options: normalized.options ?? [] } }; }

function normalizeDraftValue(input: Pick<CustomFieldDefinitionDraft, "valueType" | "options" | "required" | "key" | "label">, value: unknown): unknown {
  const field = customerCustomDefinitionToField({ id: "validation", organizationId: "validation", key: input.key, label: input.label, description: null, valueType: input.valueType, required: input.required ?? false, options: input.options ?? null, active: true });
  return normalizeFieldValue(field, value);
}

export async function createApprovedCustomFieldDefinition(input: CreateCustomFieldDefinitionInput) {
  const normalized = { ...input, key: normalizeCustomFieldKey(input.key), label: input.label.trim(), options: input.options?.map((x) => x.trim()) };
  const errors = validateCustomFieldDefinition(normalized); if (errors.length) throw new Error(errors.join(" "));
  const metadata = { ...(normalized.validation ?? {}), searchable: normalized.searchable ?? false, filterable: normalized.filterable ?? normalized.valueType === "enum", reportable: normalized.reportable ?? true, uiSection: "Özel Alanlar", uiOrder: normalized.uiOrder ?? 1000 };
  try {
    return await prisma.customFieldDefinition.create({ data: { organizationId: normalized.organizationId, createdByUserId: normalized.actorId, module: normalized.module, entityType: normalized.entityType, key: normalized.key, label: normalized.label, description: normalized.description?.trim(), valueType: normalized.valueType, required: normalized.required ?? false, optionsJson: normalized.options ?? Prisma.JsonNull, defaultValueJson: normalized.defaultValue === undefined ? Prisma.JsonNull : normalized.defaultValue as Prisma.InputJsonValue, validationJson: metadata as Prisma.InputJsonValue } });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("CUSTOM_FIELD_KEY_ALREADY_EXISTS"); throw error; }
}

export async function updateApprovedCustomFieldDefinition(input: UpdateCustomFieldDefinitionInput) {
  const existing = await prisma.customFieldDefinition.findFirst({ where: { id: input.definitionId, organizationId: input.organizationId, module: "customers", entityType: "customer", active: true } });
  if (!existing) throw new Error("CUSTOM_FIELD_NOT_FOUND");
  const draft: CustomFieldDefinitionDraft = { module: "customers", entityType: "customer", key: existing.key, label: input.label ?? existing.label, description: input.description ?? existing.description ?? undefined, valueType: existing.valueType as ModuleFieldValueType, required: input.required ?? existing.required, options: (input.options ?? (Array.isArray(existing.optionsJson) ? existing.optionsJson : undefined)) as string[] | undefined, defaultValue: input.defaultValue ?? (existing.defaultValueJson === null ? undefined : existing.defaultValueJson), validation: input.validation };
  const errors = validateCustomFieldDefinition(draft); if (errors.length) throw new Error(errors.join(" "));
  return prisma.customFieldDefinition.update({ where: { id: existing.id }, data: { label: draft.label.trim(), description: draft.description?.trim(), required: draft.required, optionsJson: draft.options ?? Prisma.JsonNull, defaultValueJson: draft.defaultValue === undefined ? Prisma.JsonNull : draft.defaultValue as Prisma.InputJsonValue, validationJson: { ...(input.validation ?? {}), searchable: input.searchable ?? false, filterable: input.filterable ?? draft.valueType === "enum", reportable: input.reportable ?? true, uiSection: "Özel Alanlar", uiOrder: input.uiOrder ?? 1000 } } });
}

export async function listCustomerCustomFields(organizationId: string) { return prisma.customFieldDefinition.findMany({ where: { organizationId, module: "customers", entityType: "customer", active: true }, orderBy: { createdAt: "asc" } }); }
export async function deprecateCustomerCustomField(input: { organizationId: string; definitionId: string }) { const result = await prisma.customFieldDefinition.updateMany({ where: { id: input.definitionId, organizationId: input.organizationId, module: "customers", entityType: "customer", active: true }, data: { active: false, deprecatedAt: new Date() } }); if (!result.count) throw new Error("CUSTOM_FIELD_NOT_FOUND"); return { id: input.definitionId }; }
export function validateCustomerCustomFieldValue(record: { id: string; organizationId: string; key: string; label: string; description: string | null; valueType: string; required: boolean; optionsJson: unknown; active: boolean }, organizationId: string, value: unknown) { if (record.organizationId !== organizationId) throw new Error("CUSTOM_FIELD_TENANT_MISMATCH"); if (!record.active) throw new Error("CUSTOM_FIELD_INACTIVE"); if ((value === null || value === "") && record.required) throw new Error("CUSTOM_FIELD_REQUIRED"); const field = customerCustomDefinitionToField({ ...record, options: record.optionsJson }); return normalizeFieldValue(field as ModuleFieldDefinition, value); }
