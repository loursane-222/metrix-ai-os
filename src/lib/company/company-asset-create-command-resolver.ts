import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { validateCompanyAssetCreateCommandResolution, type CompanyAssetCreateCommandResolution } from "./company-asset-create-command-contract";
export type GenerateCompanyAssetCreateCommandText = GenerateEditCommandText;
export type CompanyAssetCreateCommandResolveOutcome = EditCommandResolveOutcome<CompanyAssetCreateCommandResolution>;
const REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyAsset", fields: [] });
export function buildCompanyAssetCreateCommandSystemPrompt(): string {
  return [
    "Sen METRIX Şirket Varlık oluşturma formu için dar bir JSON sınıflandırıcısısın.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Alanlar: name (varlık adı), assetType (CASH_BANK_REFERENCE/MACHINE/VEHICLE/REAL_ESTATE/EQUIPMENT/OTHER_NON_INVENTORY), description (açıklama), acquisitionDate (ISO tarih), acquisitionValue (sayı metin), currentBookValue (sayı metin), estimatedCurrentValue (sayı metin).",
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].join("\n");
}
export async function resolveCompanyAssetCreateCommand(params: { utterance: string; generateText: GenerateCompanyAssetCreateCommandText }): Promise<CompanyAssetCreateCommandResolveOutcome> {
  return resolveEditCommand({ domain: "company", fieldRegistry: REGISTRY, utterance: params.utterance, activeTab: "Varlıklar", generateText: params.generateText, buildSystemPrompt: buildCompanyAssetCreateCommandSystemPrompt, validateResolution: validateCompanyAssetCreateCommandResolution });
}
