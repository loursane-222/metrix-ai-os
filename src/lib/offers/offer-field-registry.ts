import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import type { ModuleFieldDefinition } from "@/lib/field-authority/field-authority";

const specs = [
  ["customerNote", "Müşteri notu", "multiline_string", "notes", ["müşteri notu", "not"]],
  ["validUntil", "Geçerlilik tarihi", "date", "terms", ["geçerlilik tarihi", "son geçerlilik"]],
  ["paymentTerm", "Ödeme koşulu", "string", "terms", ["ödeme koşulu", "vade"]],
  ["deliveryTerm", "Teslimat koşulu", "string", "terms", ["teslimat koşulu"]],
  ["deliveryMethod", "Teslimat yöntemi", "string", "terms", ["teslimat yöntemi"]],
] as const;

export const OFFER_EDIT_FIELDS: readonly ModuleFieldDefinition[] = specs.map(([key, label, valueType, uiSection, aliases], index) => ({
  fieldId: `offer.${key}`, module: "offers", entityType: "quote", key, label, description: `${label} alanı`, valueType,
  storageKind: "scalar", requiredOnCreate: false, requiredOnUpdate: false, readable: true, writable: true, clearable: true,
  searchable: false, filterable: false, sortable: false, reportable: true, sourceOfTruth: "entity", sensitivity: "INTERNAL",
  riskLevel: "LOW", approvalPolicy: "NONE", permissionRead: "quotes.read", permissionWrite: "quotes.write", normalization: "trim",
  uiSection, uiOrder: index, custom: false, state: "ACTIVE", aliases: [...aliases],
}));

export const OFFER_EDIT_FIELD_REGISTRY = createDomainFieldRegistry({ domain: "offers", entityType: "quote", fields: OFFER_EDIT_FIELDS });
