import type { ModuleFieldDefinition, ModuleFieldValueType } from "@/lib/field-authority/field-authority";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
const specs: Array<[string, string, ModuleFieldValueType, boolean]> = [
  ["brandName", "Marka adı", "string", false],
  ["legalName", "Ticari unvan", "string", true],
  ["shortName", "Kısa ad", "string", true],
  ["companyType", "Şirket türü", "string", true],
  ["foundedAt", "Kuruluş tarihi", "date", true],
  ["country", "Ülke", "string", true],
  ["city", "Şehir", "string", true],
  ["primaryLanguage", "Ana dil", "string", true],
  ["website", "Web sitesi", "string", true],
  ["phone", "Telefon", "string", true],
  ["email", "E-posta", "string", true],
  ["logoRef", "Logo referansı", "string", true],
  ["description", "Açıklama", "multiline_string", true],
  ["industry", "Sektör", "string", true],
  ["subIndustry", "Alt sektör", "string", true],
  ["activityAreasJson", "Faaliyet alanları", "string", true],
  ["revenueModelJson", "Gelir modeli", "string", true],
  ["salesChannelsJson", "Satış kanalları", "string", true],
  ["customerTypesJson", "Müşteri türleri", "string", true],
  ["servedRegionsJson", "Hizmet verilen bölgeler", "string", true],
  ["seasonality", "Mevsimsellik", "string", true],
  ["supplyStructure", "Tedarik yapısı", "string", true],
  ["managementContext", "Temel yönetim bağlamı", "multiline_string", true],
];
export const COMPANY_PROFILE_EDIT_FIELDS: readonly ModuleFieldDefinition[] = specs.map(([key, label, valueType, clearable], index) => ({ fieldId: `company.${key}`, module: "company", entityType: "CompanyProfile", key, label, description: `${label} alanı`, valueType, storageKind: "scalar" as const, requiredOnCreate: key === "brandName", requiredOnUpdate: false, readable: true, writable: true, clearable, searchable: false, filterable: false, sortable: false, reportable: false, sourceOfTruth: "entity", sensitivity: "PUBLIC", riskLevel: "LOW", approvalPolicy: "NONE", permissionRead: "company.read", permissionWrite: "company.write", validation: {}, normalization: "trim", uiSection: "Şirket Profili", uiOrder: index, custom: false, state: "ACTIVE", aliases: [label.toLocaleLowerCase("tr-TR")] }));
export const COMPANY_PROFILE_EDIT_FIELD_REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyProfile", fields: COMPANY_PROFILE_EDIT_FIELDS });
