import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { validateCompanyGoalCreateCommandResolution, type CompanyGoalCreateCommandResolution } from "./company-goal-create-command-contract";
export type GenerateCompanyGoalCreateCommandText = GenerateEditCommandText;
export type CompanyGoalCreateCommandResolveOutcome = EditCommandResolveOutcome<CompanyGoalCreateCommandResolution>;
const REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyGoal", fields: [] });
export function buildCompanyGoalCreateCommandSystemPrompt(): string {
  return [
    "Sen METRIX Şirket Hedef oluşturma formu için dar bir JSON sınıflandırıcısısın.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Alanlar: title (hedef adı), scope (COMPANY/TEAM/PERSON/CUSTOMER_SEGMENT/PRODUCT/BRANCH), goalType (SALES/COLLECTION/REVENUE/GROSS_PROFIT/NEW_CUSTOMER/ACTIVITY/CUSTOM), period (MONTHLY/QUARTERLY/YEARLY/CUSTOM), currency (TRY/USD/EUR vb.), targetValue (sayı, metin olarak gönder).",
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].join("\n");
}
export async function resolveCompanyGoalCreateCommand(params: { utterance: string; generateText: GenerateCompanyGoalCreateCommandText }): Promise<CompanyGoalCreateCommandResolveOutcome> {
  return resolveEditCommand({ domain: "company", fieldRegistry: REGISTRY, utterance: params.utterance, activeTab: "Hedefler", generateText: params.generateText, buildSystemPrompt: buildCompanyGoalCreateCommandSystemPrompt, validateResolution: validateCompanyGoalCreateCommandResolution });
}
