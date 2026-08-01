import type { CustomerCreatePendingContext } from "./customer-create-conversation-planner";

export type CustomerSemanticOperation = "CREATE" | "UPDATE" | "ENRICH" | "QUERY" | "CANCEL" | "UNKNOWN";
export type CustomerCreateSemanticStage =
  | "OPEN"
  | "PROVIDE_FIELDS"
  | "COMMIT"
  | "OPEN_AND_PROVIDE_FIELDS"
  | "PROVIDE_FIELDS_AND_COMMIT"
  | "OPEN_PROVIDE_AND_COMMIT"
  | "STATUS_QUERY"
  | "MISSING_FIELDS_QUERY"
  | "CANCEL"
  | "UNKNOWN";

export type CustomerCreateSemanticIntent = Readonly<{
  domain: "customers";
  operation: CustomerSemanticOperation;
  stage: CustomerCreateSemanticStage;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "DETERMINISTIC";
  activeWorkflow: boolean;
  explicitCommit: boolean;
  entityReference?: string;
  probableClauseCount: number;
}>;

const entityConcept = /\b(müşteri|musteri|cari|firma|şirket|sirket|bayi)(?:si(?:ni)?|sı(?:nı)?|su(?:nu)?|sü(?:nü)?|yi|yı|yu|yü|i|ı|u|ü|miz|mız|muz|müz|ye|ya|nin|nın|nun|nün|ler|lar)?\b/i;
const createConcept = /(?:^|\s)(ekle(?:yelim)?|aç(?:alım|acağız)?|ac(?:alim|acagiz)?|oluştur(?:alım|acağız)?|olustur(?:alim|acagiz)?|kaydet|tanımla(?:yalım)?|tanimla(?:yalim)?|başlat(?:alım)?|baslat(?:alim)?|sisteme al(?:alım)?)(?=$|\s|[.,!?])/i;
const unambiguousCreateConcept = /(?:^|\s)(?:ekle(?:yelim)?|oluştur(?:alım|acağız)?|olustur(?:alim|acagiz)?|tanımla(?:yalım)?|tanimla(?:yalim)?|sisteme al(?:alım)?)(?=$|\s|[.,!?])/i;
const saveConcept = /\b(kaydet|kaydı tamamla|kaydi tamamla|bilgilerle devam et|kaydı başlat|kaydi baslat)\b/i;
const confirmationConcept = /^(?:onaylıyorum|onayliyorum|onayla|evet,?\s+onaylıyorum|evet,?\s+onayliyorum)[.!]*$/i;
const negativeConcept = /\b(kampanya|kazanmak|kaybetme|oran|raporla|raporu|sayısı|sayisini|neden|kim açtı|kim acti|butonu|konuşmayı|konusmayi|notu göster|notu goster|ne demek)\b/i;
const updateConcept = /\b(değişti|degisti|güncelle|guncelle|artık .* ile çalışıyor|artik .* ile calisiyor)\b/i;
const newEntityConcept = /\b(?:yeni|bir)\s+(?:müşteri|musteri|cari|firma|şirket|sirket|bayi)\b/i;
const createArtifactConcept = /\b(?:müşteri|musteri|cari|firma|şirket|sirket|bayi)(?:nin|nın|nun|nün|ye|ya)?\s+(?:kaydı|kaydi|kartı|karti)(?=$|\s|[.,!?])/i;

export function resolveCustomerCreateSemanticIntent(
  utterance: string,
  pendingContext: CustomerCreatePendingContext,
  hasFieldPayload: boolean,
): CustomerCreateSemanticIntent {
  const text = utterance.trim();
  const clauses = splitCustomerClauses(text);
  const assertedClauses = clauses.filter((clause) => !isProbableClause(clause));
  const probableClauseCount = clauses.length - assertedClauses.length;
  const activeWorkflow = pendingContext !== null;
  const base = { domain: "customers" as const, source: "DETERMINISTIC" as const, activeWorkflow, probableClauseCount };
  if (/^(kaydettin mi|kaydedildi mi|işlem bitti mi|islem bitti mi|durum ne)[?.!]*$/i.test(text)) return activeWorkflow ? { ...base, operation: "QUERY", stage: "STATUS_QUERY", confidence: "HIGH", explicitCommit: false } : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "HIGH", explicitCommit: false };
  if (/^(eksik ne kaldı|eksik ne kaldi|hangi bilgi eksik|burada ne söylemeliyim|burada ne soylemeliyim|nasıl kullanacağım|nasil kullanacagim|yardım et|yardim et)[?.!]*$/i.test(text)) return activeWorkflow ? { ...base, operation: "QUERY", stage: "MISSING_FIELDS_QUERY", confidence: "HIGH", explicitCommit: false } : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "HIGH", explicitCommit: false };
  if (/^(vazgeç|vazgec|iptal et|müşteri oluşturmayı iptal et|musteri olusturmayi iptal et)[.!]*$/i.test(text)) return activeWorkflow ? { ...base, operation: "CANCEL", stage: "CANCEL", confidence: "HIGH", explicitCommit: false } : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "HIGH", explicitCommit: false };
  const saveOnly = /^(kaydet|tamamla|kaydı tamamla|kaydi tamamla)[.!]*$/i.test(text);
  if (saveOnly) return activeWorkflow
    ? { ...base, operation: "CREATE", stage: "COMMIT", confidence: "HIGH", explicitCommit: true }
    : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "LOW", explicitCommit: false };
  if (confirmationConcept.test(text)) return activeWorkflow
    ? { ...base, operation: "CREATE", stage: "COMMIT", confidence: "HIGH", explicitCommit: true }
    : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "LOW", explicitCommit: false };
  if (negativeConcept.test(text)) return { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "HIGH", explicitCommit: false };
  if (activeWorkflow && saveConcept.test(text) && !entityConcept.test(text)) return { ...base, operation: "CREATE", stage: "COMMIT", confidence: "HIGH", explicitCommit: true };
  const entity = entityConcept.test(text);
  const create = createConcept.test(text);
  const declaration = !/[?]\s*$/.test(text) && (/\b(?:artık|artik)\s+(?:bizim\s+)?(?:yeni\s+)?müşterimiz\b/i.test(text) || /\bmüşteri olarak\b/i.test(text) || /\bmüşterimiz[.!]*$/i.test(text));
  const systemOnboarding = /\bsisteme\s+(?:ekle|al)(?:yelim|alım)?(?=$|\s|[.,!?])/i.test(text);
  const createWorkflowEvidence = newEntityConcept.test(text) || createArtifactConcept.test(text) || declaration || systemOnboarding || (entity && unambiguousCreateConcept.test(text));
  const updateClause = assertedClauses.find((clause) => updateConcept.test(clause));
  const update = Boolean(updateClause) && !declaration;
  if (update) return { ...base, operation: "ENRICH", stage: "PROVIDE_FIELDS", confidence: "HIGH", explicitCommit: false, ...entityReference(updateClause!) };
  const explicitUpdateClause = assertedClauses.find((clause) => /[’'](?:ın|in|un|ün)\b/iu.test(clause) && /\b(?:yap|değiştir|degistir|güncelle|guncelle)\b/iu.test(clause));
  if (explicitUpdateClause && hasFieldPayload) return { ...base, operation: "UPDATE", stage: "PROVIDE_FIELDS", confidence: "HIGH", explicitCommit: false, ...entityReference(explicitUpdateClause) };
  if (activeWorkflow && hasFieldPayload) {
    const requestedSaveInline = saveConcept.test(text);
    return { ...base, operation: "CREATE", stage: requestedSaveInline ? "PROVIDE_FIELDS_AND_COMMIT" : "PROVIDE_FIELDS", confidence: "HIGH", explicitCommit: requestedSaveInline };
  }
  if (!(createWorkflowEvidence && (create || declaration || systemOnboarding))) return { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: entity || create ? "LOW" : "HIGH", explicitCommit: false };
  const requestedSave = saveConcept.test(text);
  const explicitCommit = requestedSave && hasFieldPayload;
  const stage = hasFieldPayload
    ? explicitCommit ? "OPEN_PROVIDE_AND_COMMIT" : "OPEN_AND_PROVIDE_FIELDS"
    : "OPEN";
  return { ...base, operation: "CREATE", stage, confidence: "HIGH", explicitCommit, ...entityReference(text) };
}

function entityReference(text: string): { entityReference?: string } {
  const match = text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+(?:için\s+)?(?:yeni\s+)?(?:bir\s+)?(?:müşteri|musteri|cari|firma|şirket|sirket|bayi)(?:si(?:ni)?|sı(?:nı)?|su(?:nu)?|sü(?:nü)?)?(?:\s+kartı|\s+karti)?\b/i)
    ?? text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+(?:artık|artik)\s+(?:bizim\s+)?müşterimiz\b/i)
    ?? text.match(/^(.+?)(?:[’']?(?:ın|in|un|ün))?\s+(?:artık|artik)\b/i)
    ?? text.match(/^(.+?)[’'](?:ın|in|un|ün)\s+/iu)
    ?? text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+sisteme\s+(?:ekle|al)/i);
  const value = match?.[1]?.trim().replace(/^(?:metrix\s+)?(?:yeni|bir)(?:\s+|$)/i, "").replace(/[,.]+$/, "");
  return value && !/^(?:metrix|yeni|bir)$/i.test(value) && value.split(/\s+/).length <= 8 ? { entityReference: value } : {};
}

export function splitCustomerClauses(text: string): string[] {
  return text.split(/[.!?]+(?=\s|$)|\s*,\s*/u).map((value) => value.trim()).filter(Boolean);
}

export function isProbableClause(text: string): boolean {
  return /\b(?:muhtemel|olası|olasi|bekleniyor|bekliyorum|ihtimal|tahmin|sanırım|sanirim|olabilir)\b/iu.test(text);
}
