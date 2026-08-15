import type { ModuleFieldDefinition, ModuleFieldValueType } from "@/lib/field-authority/field-authority";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
const specs: Array<[string, string, ModuleFieldValueType]> = [
  ["taxOffice", "Vergi dairesi", "string"],
  ["taxNumber", "Vergi numarası", "string"],
  ["mersisNo", "MERSİS numarası", "string"],
  ["tradeRegistryNo", "Ticaret sicil numarası", "string"],
  ["chamberRegistration", "Oda kaydı", "string"],
  ["kepAddress", "KEP adresi", "string"],
  ["eInvoiceEnabled", "E-fatura durumu", "string"],
  ["eArchiveEnabled", "E-arşiv durumu", "string"],
  ["authorizedRepresentativesJson", "Yetkili temsilciler", "string"],
  ["officialDocumentsJson", "Belge ve geçerlilik referansları", "string"],
  ["baseCurrency", "Ana para birimi", "string"],
  ["currenciesJson", "Kullanılan para birimleri", "string"],
  ["fiscalYearStartMonth", "Mali yıl başlangıç ayı", "string"],
  ["defaultPaymentTerms", "Varsayılan ödeme koşulları", "string"],
  ["standardMaturityDays", "Standart vade", "string"],
  ["discountPolicy", "İskonto yaklaşımı", "string"],
  ["creditRiskPolicy", "Kredi/risk politikası", "string"],
  ["profitabilityPolicy", "Hedef kârlılık", "string"],
  ["budgetPeriod", "Bütçe periyodu", "string"],
];
export const COMPANY_PROFILE_CANDIDATE_FIELDS: readonly ModuleFieldDefinition[] = specs.map(([key, label, valueType], index) => ({ fieldId: `company.candidate.${key}`, module: "company", entityType: "CompanyProfileCandidate", key, label, description: `${label} alanı (onay gerektiren)`, valueType, storageKind: "scalar" as const, requiredOnCreate: false, requiredOnUpdate: false, readable: true, writable: true, clearable: true, searchable: false, filterable: false, sortable: false, reportable: false, sourceOfTruth: "entity", sensitivity: "SENSITIVE", riskLevel: "MEDIUM", approvalPolicy: "EXPLICIT", permissionRead: "company.read", permissionWrite: "company.write", validation: {}, normalization: "trim", uiSection: "Resmî/Finansal Bilgiler", uiOrder: index, custom: false, state: "ACTIVE", aliases: [label.toLocaleLowerCase("tr-TR")] }));
export const COMPANY_PROFILE_CANDIDATE_FIELD_REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyProfileCandidate", fields: COMPANY_PROFILE_CANDIDATE_FIELDS });
