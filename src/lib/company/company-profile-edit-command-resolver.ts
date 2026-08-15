import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { validateCompanyProfileEditCommandResolution, type CompanyProfileEditCommandResolution } from "./company-profile-edit-command-contract";
import { COMPANY_PROFILE_EDIT_FIELD_REGISTRY } from "./company-profile-edit-field-registry";
export type CompanyProfileEditCommandResolveOutcome = EditCommandResolveOutcome<CompanyProfileEditCommandResolution>;
export type GenerateCompanyProfileEditCommandText = GenerateEditCommandText;
export function buildCompanyProfileEditCommandSystemPrompt(): string {
  return [
    "Sen METRIX Şirket Profil Düzenleme ekranındaki komutları yorumlayan dar bir JSON sınıflandırıcısısın.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Kimlik ve İletişim alanları: brandName, legalName, shortName, companyType, foundedAt, country, city, primaryLanguage, website, phone, email, logoRef, description.",
    "İş Modeli alanları: industry, subIndustry, activityAreasJson, revenueModelJson, salesChannelsJson, customerTypesJson, servedRegionsJson, seasonality, supplyStructure, managementContext.",
    "...Json son ekli alanlar virgülle ayrılmış liste formatında değer alır; örneğin: \"Retail,B2B,E-ticaret\".",
    "brandName alanı zorunludur, clear_field ile temizlenemez.",
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"clear_field","field":"<opsiyonel alan>"}',
    '{"result":"executable","action":"revert_field","field":"<alan>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"executable","action":"discard"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].join("\n");
}
export function resolveCompanyProfileEditCommand(params: { utterance: string; activeTab: string; generateText: GenerateCompanyProfileEditCommandText }): Promise<CompanyProfileEditCommandResolveOutcome> {
  return resolveEditCommand({ domain: "company", fieldRegistry: COMPANY_PROFILE_EDIT_FIELD_REGISTRY, ...params, buildSystemPrompt: buildCompanyProfileEditCommandSystemPrompt, validateResolution: validateCompanyProfileEditCommandResolution });
}
