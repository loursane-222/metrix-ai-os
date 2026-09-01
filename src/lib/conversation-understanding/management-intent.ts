import type { ConversationUnderstanding, ManagementIntent } from "./conversation-understanding.types";

const COLLECTION = /(?:tahsilat(?:lar(?:ımız|imiz|ım|im)?|ımız|imiz)?|koleksiyon)/iu;
const CURRENT_MONTH = /\bbu\s+ay(?:ki)?\b/iu;
const PREVIOUS_MONTH = /\bgeçen\s+ay(?:ki)?\b/iu;
const PERFORMANCE = /(?:performans(?:ı|ımız|imiz)?|nasıl|nasil|nasıldı|nasildi|ne\s+durumda|gidişat|gidisat|sonuç|sonuc)/iu;
const PAYMENT_STATE = /(?:bekleyen|vadesi\s+geç(?:en|miş)|vadesi\s+gecen|ödenmemiş|odenmemis|ödeme\s+durumu|odeme\s+durumu)/iu;

/** Explicit period collection performance is a deterministic management fact request, not a Payment-list request. */
export function recognizeManagementIntent(message: string): ManagementIntent | null {
  const normalized = message.trim();
  if (!COLLECTION.test(normalized) || !PERFORMANCE.test(normalized) || PAYMENT_STATE.test(normalized)) return null;
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
    shouldInvokeExecutiveBrain: true,
    suggestedHandling: "executive_reasoning",
    managementIntent,
    businessNavigation: null,
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: null,
    reasoning: {
      summary: "Açık dönemli tahsilat performansı isteği deterministik olarak çözüldü.",
      observations: [managementIntent.intent, managementIntent.period],
      uncertainty: [],
      whyThisHandling: "Tahsilat performansı Settlement dönem gerçeğinden yanıtlanır; Payment listesi açılmaz.",
    },
  });
}
