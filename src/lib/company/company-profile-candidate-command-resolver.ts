import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { validateCompanyProfileCandidateCommandResolution, type CompanyProfileCandidateCommandResolution } from "./company-profile-candidate-command-contract";
import { COMPANY_PROFILE_CANDIDATE_FIELD_REGISTRY } from "./company-profile-candidate-field-registry";
export type CompanyProfileCandidateCommandResolveOutcome = EditCommandResolveOutcome<CompanyProfileCandidateCommandResolution>;
export type GenerateCompanyProfileCandidateCommandText = GenerateEditCommandText;
export function buildCompanyProfileCandidateCommandSystemPrompt(): string {
  return [
    "Sen METRIX Şirket Resmî/Finansal Bilgiler değişiklik önerisi ekranındaki komutları yorumlayan dar bir JSON sınıflandırıcısısın.",
    "Bu ekran doğrudan kaydetmez; commit komutu onay bekleyen bir BusinessCandidate önerisi oluşturur.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Resmî Bilgiler alanları: taxOffice, taxNumber, mersisNo, tradeRegistryNo, chamberRegistration, kepAddress, eInvoiceEnabled, eArchiveEnabled, authorizedRepresentativesJson, officialDocumentsJson.",
    "Finansal Ayarlar alanları: baseCurrency, currenciesJson, fiscalYearStartMonth, defaultPaymentTerms, standardMaturityDays, discountPolicy, creditRiskPolicy, profitabilityPolicy, budgetPeriod.",
    "...Json son ekli alanlar virgülle ayrılmış liste formatında değer alır.",
    "eInvoiceEnabled ve eArchiveEnabled boolean değer alır: true veya false.",
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"clear_field","field":"<alan>"}',
    '{"result":"executable","action":"revert_field","field":"<alan>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"executable","action":"discard"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].join("\n");
}
export function resolveCompanyProfileCandidateCommand(params: { utterance: string; activeTab: string; generateText: GenerateCompanyProfileCandidateCommandText }): Promise<CompanyProfileCandidateCommandResolveOutcome> {
  return resolveEditCommand({ domain: "company", fieldRegistry: COMPANY_PROFILE_CANDIDATE_FIELD_REGISTRY, ...params, buildSystemPrompt: buildCompanyProfileCandidateCommandSystemPrompt, validateResolution: validateCompanyProfileCandidateCommandResolution });
}
