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
}>;

const entityConcept = /\b(müşteri|musteri|cari|firma|şirket|sirket|bayi)(?:yi|yı|yu|yü|i|ı|u|ü|miz|mız|muz|müz|ye|ya|nin|nın|nun|nün|ler|lar)?\b/i;
const createConcept = /(?:^|\s)(ekle(?:yelim)?|aç(?:alım)?|ac(?:alim)?|oluştur(?:alım)?|olustur(?:alim)?|kaydet|tanımla(?:yalım)?|tanimla(?:yalim)?|başlat(?:alım)?|baslat(?:alim)?|sisteme al(?:alım)?)(?=$|\s|[.,!?])/i;
const saveConcept = /\b(kaydet|kaydı tamamla|kaydi tamamla|bilgilerle devam et|kaydı başlat|kaydi baslat)\b/i;
const negativeConcept = /\b(kampanya|kazanmak|kaybetme|oran|raporla|raporu|sayısı|sayisini|neden|kim açtı|kim acti|butonu|konuşmayı|konusmayi|notu göster|notu goster|ne demek)\b/i;
const updateConcept = /\b(değişti|degisti|güncelle|guncelle|artık .* ile çalışıyor|artik .* ile calisiyor)\b/i;

export function resolveCustomerCreateSemanticIntent(
  utterance: string,
  pendingContext: CustomerCreatePendingContext,
  hasFieldPayload: boolean,
): CustomerCreateSemanticIntent {
  const text = utterance.trim();
  const activeWorkflow = pendingContext !== null;
  const base = { domain: "customers" as const, source: "DETERMINISTIC" as const, activeWorkflow };
  if (/^(kaydettin mi|kaydedildi mi|işlem bitti mi|islem bitti mi|durum ne)[?.!]*$/i.test(text)) return { ...base, operation: "QUERY", stage: "STATUS_QUERY", confidence: "HIGH", explicitCommit: false };
  if (/^(eksik ne kaldı|eksik ne kaldi|hangi bilgi eksik|burada ne söylemeliyim|burada ne soylemeliyim|nasıl kullanacağım|nasil kullanacagim|yardım et|yardim et)[?.!]*$/i.test(text)) return { ...base, operation: "QUERY", stage: "MISSING_FIELDS_QUERY", confidence: "HIGH", explicitCommit: false };
  if (/^(vazgeç|vazgec|iptal et|müşteri oluşturmayı iptal et|musteri olusturmayi iptal et)[.!]*$/i.test(text)) return { ...base, operation: "CANCEL", stage: "CANCEL", confidence: "HIGH", explicitCommit: false };
  const saveOnly = /^(kaydet|tamamla|kaydı tamamla|kaydi tamamla)[.!]*$/i.test(text);
  if (saveOnly) return activeWorkflow
    ? { ...base, operation: "CREATE", stage: "COMMIT", confidence: "HIGH", explicitCommit: true }
    : { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "LOW", explicitCommit: false };
  if (negativeConcept.test(text)) return { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: "HIGH", explicitCommit: false };
  if (activeWorkflow && saveConcept.test(text) && !entityConcept.test(text)) return { ...base, operation: "CREATE", stage: "COMMIT", confidence: "HIGH", explicitCommit: true };
  const entity = entityConcept.test(text);
  const create = createConcept.test(text);
  const declaration = !/[?]\s*$/.test(text) && (/\b(?:artık|artik)\s+(?:bizim\s+)?(?:yeni\s+)?müşterimiz\b/i.test(text) || /\bmüşteri olarak\b/i.test(text) || /\bmüşterimiz[.!]*$/i.test(text));
  const systemOnboarding = /\bsisteme\s+(?:ekle|al)(?:yelim|alım)?(?=$|\s|[.,!?])/i.test(text);
  const update = updateConcept.test(text) && !declaration;
  if (update) return { ...base, operation: "ENRICH", stage: "PROVIDE_FIELDS", confidence: "HIGH", explicitCommit: false, ...entityReference(text) };
  if (!((entity && (create || declaration)) || systemOnboarding)) return { ...base, operation: "UNKNOWN", stage: "UNKNOWN", confidence: entity || create ? "LOW" : "HIGH", explicitCommit: false };
  const requestedSave = saveConcept.test(text);
  const explicitCommit = requestedSave && hasFieldPayload;
  const stage = hasFieldPayload
    ? explicitCommit ? "OPEN_PROVIDE_AND_COMMIT" : "OPEN_AND_PROVIDE_FIELDS"
    : "OPEN";
  return { ...base, operation: "CREATE", stage, confidence: "HIGH", explicitCommit, ...entityReference(text) };
}

function entityReference(text: string): { entityReference?: string } {
  const match = text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+(?:için\s+)?(?:yeni\s+)?(?:bir\s+)?(?:müşteri|musteri|cari|firma|şirket|sirket|bayi)(?:\s+kartı|\s+karti)?\b/i)
    ?? text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+(?:artık|artik)\s+(?:bizim\s+)?müşterimiz\b/i)
    ?? text.match(/^(.+?)(?:[’']?(?:yı|yi|yu|yü))?\s+sisteme\s+(?:ekle|al)/i);
  const value = match?.[1]?.trim().replace(/^(?:metrix\s+)?(?:yeni|bir)(?:\s+|$)/i, "").replace(/[,.]+$/, "");
  return value && !/^(?:metrix|yeni|bir)$/i.test(value) && value.split(/\s+/).length <= 8 ? { entityReference: value } : {};
}
