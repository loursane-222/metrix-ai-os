import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";

export type DomainFieldRegistry = Readonly<{
  domain: string;
  entityType: string;
  fields: readonly ModuleFieldDefinition[];
}>;

export function createDomainFieldRegistry(input: DomainFieldRegistry): DomainFieldRegistry {
  const keys = new Set<string>();
  for (const field of input.fields) {
    if (field.module !== input.domain || field.entityType !== input.entityType) throw new Error(`Field ${field.fieldId} does not belong to ${input.domain}:${input.entityType}.`);
    if (keys.has(field.key)) throw new Error(`Duplicate edit field key: ${field.key}.`);
    keys.add(field.key);
  }
  return Object.freeze({ ...input, fields: Object.freeze([...input.fields]) });
}

export function writableDomainFieldKeys(registry: DomainFieldRegistry): readonly string[] {
  return registry.fields.filter((field) => field.writable).map((field) => field.key);
}
