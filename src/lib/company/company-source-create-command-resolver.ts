import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { validateCompanySourceCreateCommandResolution, type CompanySourceCreateCommandResolution } from "./company-source-create-command-contract";
export type GenerateCompanySourceCreateCommandText = GenerateEditCommandText;
export type CompanySourceCreateCommandResolveOutcome = EditCommandResolveOutcome<CompanySourceCreateCommandResolution>;
const REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyDataSource", fields: [] });
export function buildCompanySourceCreateCommandSystemPrompt(): string {
  return [
    "Sen METRIX Şirket Veri Kaynağı oluşturma formu için dar bir JSON sınıflandırıcısısın.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Alanlar: provider (entegrasyon sağlayıcı adı), sourceType (ERP/CRM/ACCOUNTING/DOCUMENT/API/OTHER).",
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].join("\n");
}
export async function resolveCompanySourceCreateCommand(params: { utterance: string; generateText: GenerateCompanySourceCreateCommandText }): Promise<CompanySourceCreateCommandResolveOutcome> {
  return resolveEditCommand({ domain: "company", fieldRegistry: REGISTRY, utterance: params.utterance, activeTab: "Entegrasyonlar", generateText: params.generateText, buildSystemPrompt: buildCompanySourceCreateCommandSystemPrompt, validateResolution: validateCompanySourceCreateCommandResolution });
}
