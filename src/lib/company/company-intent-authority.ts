export const COMPANY_INTENT_EXAMPLES = [
  { utterance: "Şirketin merkez adresini değiştir.", kind: "MUTATION", targetDomain: "CompanyUnit", authority: "BUSINESS_CANDIDATE" },
  { utterance: "Yeni depomuzu ekle.", kind: "MUTATION", targetDomain: "CompanyUnit", authority: "BUSINESS_CANDIDATE" },
  { utterance: "Bu yıl satış hedefimizi 25 milyon TL yap.", kind: "MUTATION", targetDomain: "SalesGoal", authority: "BUSINESS_CANDIDATE" },
  { utterance: "Şirket profilimize aylık enerji tüketimi alanı ekle.", kind: "MUTATION", targetDomain: "CustomFieldDefinition", authority: "BUSINESS_CANDIDATE" },
  { utterance: "Faaliyet alanımızı doğal taş ihracatı olarak güncelle.", kind: "MUTATION", targetDomain: "CompanyProfile", authority: "BUSINESS_CANDIDATE" },
  { utterance: "Şirketin genel giderlerini göster.", kind: "READ", targetDomain: "CompanyFinancialProjection", authority: "CANONICAL_PROJECTION" },
  { utterance: "Bu ay kârda mıyız?", kind: "READ", targetDomain: "CompanyFinancialProjection", authority: "CANONICAL_PROJECTION" },
  { utterance: "Satış ekibinin haftalık rapor durumunu göster.", kind: "READ", targetDomain: "ReportSubmission", authority: "CANONICAL_PROJECTION" },
] as const;

export function resolveCompanyIntentAuthority(utterance: string, channel: "TEXT" | "VOICE") {
  const normalized = utterance.toLocaleLowerCase("tr-TR").replace(/[?.!]/g, "").trim();
  const match = COMPANY_INTENT_EXAMPLES.find((item) => item.utterance.toLocaleLowerCase("tr-TR").replace(/[?.!]/g, "").trim() === normalized);
  return match ? { ...match, channel, reasoningAuthority: "UNIVERSAL_CAPTURE", responseAuthority: "CANONICAL_RESPONSE_PRODUCER" as const } : null;
}
