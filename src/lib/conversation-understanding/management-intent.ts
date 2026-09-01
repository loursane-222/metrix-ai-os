import type { ConversationUnderstanding, ManagementIntent } from "./conversation-understanding.types";

const COLLECTION = /(?:tahsilat[a-zçğıöşü]*|koleksiyon)/iu;
const CURRENT_MONTH = /\bbu\s+ay(?:ki)?\b/iu;
const PREVIOUS_MONTH = /\bgeçen\s+ay(?:ki)?\b/iu;
const PERFORMANCE = /(?:performans(?:ı|ımız|imiz)?|nasıl|nasil|nasıldı|nasildi|ne\s+durumda|gidişat|gidisat|sonuç|sonuc)/iu;
const PAYMENT_STATE = /(?:bekleyen|vadesi\s+geç(?:en|miş)|vadesi\s+gecen|ödenmemiş|odenmemis|ödeme\s+durumu|odeme\s+durumu)/iu;
const MONTH_COMPARISON = /(?:bu\s+ay(?:ki)?[\s\S]*(?:geçen|önceki)\s+ay|(?:geçen|önceki)\s+ay(?:a|la)?\s+(?:göre|kıyasla))/iu;
const WEEK_COMPARISON = /(?:bu\s+hafta(?:ki)?[\s\S]*(?:geçen|önceki)\s+hafta|(?:geçen|önceki)\s+hafta(?:ya|yla)?\s+(?:göre|kıyasla))/iu;
const DRIVER = /(?:neden|sebebi|nedeni|nereden\s+geliyor|katkıda\s+bulundu)/iu;
const TARGET = /(?:hedef(?:e|i|imiz|imizin)?|gerçekleştirdik|gerceklestirdik)/iu;
const CUSTOMER_DRIVER = /(?:düşüş|dusus)[\s\S]*(?:müşteri|musteri)[\s\S]*katkı/iu;
const COLLECTION_TARGET_SHORTCUT = /^\s*hedefe\s+göre\s+ne\s+kadar\s+gerideyiz\s*[?.!]*\s*$/iu;
const RECEIVABLE = /(?:alacağ(?:ımız|ımızın|ımızda|ımızı|ımızdan|ımız var|ımız bulunuyor)|alacak(?:larımız|lar|ları)?)/iu;

function recognizeReceivableIntent(message: string): ManagementIntent | null {
  const historical = /(?:geçen\s+ay|önceki\s+ay|geçmişte)/iu.test(message);
  if (/\bdso\b/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "DSO_UNSUPPORTED" });
  if (!RECEIVABLE.test(message)) return null;
  if (historical && /(?:yaşlandır|gecik|geçik|90)/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "HISTORICAL_UNSUPPORTED" });
  if (/hangi\s+müşterilerde[\s\S]*(?:gecikmiş|geçikmiş)[\s\S]*(?:en\s+yüksek|fazla)/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "CUSTOMER_OVERDUE_RANKING" });
  if (/en\s+büyük[\s\S]*(?:gecikmiş|geçikmiş)/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "LARGEST_OVERDUE" });
  if (/90\s+günden\s+(?:uzun|fazla)/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "OVERDUE_90_PLUS" });
  if (/yaşlandır/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "AGING" });
  if (/önümüzdeki\s+30\s+gün/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "DUE_NEXT_30_DAYS" });
  if (/önümüzdeki\s+14\s+gün/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "DUE_NEXT_14_DAYS" });
  if (/önümüzdeki\s+7\s+gün/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "DUE_NEXT_7_DAYS" });
  if (/bugün[\s\S]*vadesi\s+gel/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "DUE_TODAY" });
  if (/(?:gecikmiş|geçikmiş|vadesi\s+geçmiş)/iu.test(message) && /(?:ne\s+kadar|alacağ|alacak)/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "OVERDUE" });
  if (/(?:toplam|açık)[\s\S]*(?:ne\s+kadar|alacağ|alacak)|ne\s+kadar[\s\S]*alacağımız\s+var/iu.test(message)) return Object.freeze({ intent: "RECEIVABLE_POSITION", queryMode: "TOTAL" });
  return null;
}

/** Explicit period collection performance is a deterministic management fact request, not a Payment-list request. */
export function recognizeManagementIntent(message: string): ManagementIntent | null {
  const normalized = message.trim();
  const receivableIntent = recognizeReceivableIntent(normalized);
  if (receivableIntent) return receivableIntent;
  if (PAYMENT_STATE.test(normalized)) return null;
  if (TARGET.test(normalized) && (COLLECTION.test(normalized) || COLLECTION_TARGET_SHORTCUT.test(normalized))) {
    return Object.freeze({ intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" });
  }
  if (!COLLECTION.test(normalized) && !CUSTOMER_DRIVER.test(normalized)) return null;
  if (DRIVER.test(normalized)) return Object.freeze({ intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" });
  if (MONTH_COMPARISON.test(normalized)) return Object.freeze({ intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" });
  if (WEEK_COMPARISON.test(normalized)) return Object.freeze({ intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_WEEK", comparablePeriod: "PREVIOUS_WEEK" });
  if (!PERFORMANCE.test(normalized)) return null;
  if (CURRENT_MONTH.test(normalized)) return Object.freeze({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" });
  if (PREVIOUS_MONTH.test(normalized)) return Object.freeze({ intent: "COLLECTION_PERFORMANCE", period: "PREVIOUS_MONTH" });
  return null;
}

export function buildManagementIntentUnderstanding(managementIntent: ManagementIntent): ConversationUnderstanding {
  const unsupportedReceivable = managementIntent.intent === "RECEIVABLE_POSITION" && (managementIntent.queryMode === "HISTORICAL_UNSUPPORTED" || managementIntent.queryMode === "DSO_UNSUPPORTED");
  return Object.freeze({
    conversationKind: "company_related",
    userMotivation: "bilgi_almak",
    companyRelevance: "high",
    actionExpectation: "none",
    confidence: "high",
    shouldAskClarification: false,
    shouldInvokeExecutiveBrain: false,
    suggestedHandling: "answer_only",
    managementIntent,
    businessNavigation: unsupportedReceivable ? null : Object.freeze({ operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null }),
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: null,
    reasoning: {
      summary: "Açık dönemli tahsilat performansı isteği deterministik olarak çözüldü.",
      observations: managementIntent.intent === "RECEIVABLE_POSITION"
        ? [managementIntent.intent, managementIntent.queryMode]
        : managementIntent.intent === "COLLECTION_PERFORMANCE" || managementIntent.intent === "COLLECTION_TARGET_POSITION"
        ? [managementIntent.intent, managementIntent.period]
        : [managementIntent.intent, managementIntent.primaryPeriod, managementIntent.comparablePeriod],
      uncertainty: [],
      whyThisHandling: "Tahsilat performansı Settlement dönem gerçeğinden yanıtlanır; kanonik Tahsilatlar çalışma alanı eşlik eder.",
    },
  });
}
