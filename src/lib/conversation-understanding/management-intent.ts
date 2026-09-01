import type { ConversationUnderstanding, ManagementIntent } from "./conversation-understanding.types";

const COLLECTION = /(?:tahsilat(?:lar(?:ımız|imiz|ım|im)?|ımız|imiz)?|koleksiyon)/iu;
const CURRENT_MONTH = /\bbu\s+ay(?:ki)?\b/iu;
const PREVIOUS_MONTH = /\bgeçen\s+ay(?:ki)?\b/iu;
const PERFORMANCE = /(?:performans(?:ı|ımız|imiz)?|nasıl|nasil|nasıldı|nasildi|ne\s+durumda|gidişat|gidisat|sonuç|sonuc)/iu;
const PAYMENT_STATE = /(?:bekleyen|vadesi\s+geç(?:en|miş)|vadesi\s+gecen|ödenmemiş|odenmemis|ödeme\s+durumu|odeme\s+durumu)/iu;
const MONTH_COMPARISON = /(?:bu\s+ay(?:ki)?[\s\S]*(?:geçen|önceki)\s+ay|(?:geçen|önceki)\s+ay(?:a|la)?\s+(?:göre|kıyasla))/iu;
const WEEK_COMPARISON = /(?:bu\s+hafta(?:ki)?[\s\S]*(?:geçen|önceki)\s+hafta|(?:geçen|önceki)\s+hafta(?:ya|yla)?\s+(?:göre|kıyasla))/iu;

/** Explicit period collection performance is a deterministic management fact request, not a Payment-list request. */
export function recognizeManagementIntent(message: string): ManagementIntent | null {
  const normalized = message.trim();
  if (!COLLECTION.test(normalized) || PAYMENT_STATE.test(normalized)) return null;
  if (MONTH_COMPARISON.test(normalized)) return Object.freeze({ intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" });
  if (WEEK_COMPARISON.test(normalized)) return Object.freeze({ intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_WEEK", comparablePeriod: "PREVIOUS_WEEK" });
  if (!PERFORMANCE.test(normalized)) return null;
  if (CURRENT_MONTH.test(normalized)) return Object.freeze({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" });
  if (PREVIOUS_MONTH.test(normalized)) return Object.freeze({ intent: "COLLECTION_PERFORMANCE", period: "PREVIOUS_MONTH" });
  return null;
}

export function buildManagementIntentUnderstanding(managementIntent: ManagementIntent): ConversationUnderstanding {
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
    businessNavigation: Object.freeze({ operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null }),
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: null,
    reasoning: {
      summary: "Açık dönemli tahsilat performansı isteği deterministik olarak çözüldü.",
      observations: managementIntent.intent === "COLLECTION_PERFORMANCE"
        ? [managementIntent.intent, managementIntent.period]
        : [managementIntent.intent, managementIntent.primaryPeriod, managementIntent.comparablePeriod],
      uncertainty: [],
      whyThisHandling: "Tahsilat performansı Settlement dönem gerçeğinden yanıtlanır; kanonik Tahsilatlar çalışma alanı eşlik eder.",
    },
  });
}
