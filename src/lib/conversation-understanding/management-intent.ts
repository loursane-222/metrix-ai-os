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
const PAYABLE = /(?:borç(?:umuz|larımız|ların)?|borcumuz|borcun|ödeme\s+yükümlülüğümüz)/iu;
const FINANCIAL_CONTEXT = /(?:finans(?:al|ta)?|tahsilat[\s\S]*(?:borç|borc)|(?:borç|borc)[\s\S]*tahsilat)/iu;
const ATTENTION_REQUEST = /(?:dikkat\s+et|dikkat\s+gerektir|öncelikli\s+olarak|önemli\s+bir\s+durum)/iu;
const OVERVIEW_REQUEST = /(?:genel\s+durum|durumumuz\s+nasıl|şu\s+anda\s+neredeyiz|özet(?:le|ler\s+misin)?|genel\s+tablo|bilmem\s+gerekenleri)/iu;
const COMPLETE_FINANCIAL_LIST = /tahsilat[\s\S]*alacak[\s\S]*borç[\s\S]*nakit/iu;
const QUOTE = /\bteklif(?:ler(?:imiz|in|i)?|i|imiz)?\b/iu;

function recognizeQuotePipelineIntent(message: string): ManagementIntent | null {
  if (/(?:bu|geçen|önceki)\s+(?:ay|hafta)/iu.test(message)) return null;
  if (/(?:satış\s+pipeline|pipeline['’]?(?:ımız|imiz)?)/iu.test(message)) return Object.freeze({ intent: "QUOTE_PIPELINE", queryMode: "SUMMARY" });
  if (!QUOTE.test(message) || !/(?:açık|acik)/iu.test(message)) return null;
  if (/(?:en\s+büyük|en\s+yüksek)/iu.test(message)) return Object.freeze({ intent: "QUOTE_PIPELINE", queryMode: "LARGEST_OPEN" });
  if (/(?:hangi\s+müşteri|müşterilerde)/iu.test(message)) return Object.freeze({ intent: "QUOTE_PIPELINE", queryMode: "CUSTOMER_DISTRIBUTION" });
  if (/(?:toplam\s+değer|toplam\s+deger|değeri\s+nedir|degeri\s+nedir)/iu.test(message)) return Object.freeze({ intent: "QUOTE_PIPELINE", queryMode: "TOTAL_VALUE" });
  return null;
}

function recognizeQuoteActivityIntent(message: string): ManagementIntent | null {
  if (!QUOTE.test(message)) return null;
  const period = PREVIOUS_MONTH.test(message) ? "PREVIOUS_MONTH" : CURRENT_MONTH.test(message) ? "CURRENT_MONTH" : null;
  if (!period) return null;
  const countMode = /kaç\s+kez/iu.test(message) ? "EVENTS" : "DISTINCT_QUOTES";
  if (/(?:oluşturduk|oluşturuldu|hazırladık)/iu.test(message)) return Object.freeze({ intent: "QUOTE_ACTIVITY", activity: "CREATED", countMode: "DISTINCT_QUOTES", period });
  if (/(?:gönderdik|gönderildi)/iu.test(message)) return Object.freeze({ intent: "QUOTE_ACTIVITY", activity: "SENT", countMode, period });
  if (/(?:görüntülendi|görüntüledi|görüldü)/iu.test(message)) return Object.freeze({ intent: "QUOTE_ACTIVITY", activity: "VIEWED", countMode, period });
  if (/(?:kabul\s+edildi|onaylandı|kazanıldı)/iu.test(message)) return Object.freeze({ intent: "QUOTE_ACTIVITY", activity: "ACCEPTED", countMode: "DISTINCT_QUOTES", period });
  if (/(?:reddedildi|kaybedildi)/iu.test(message)) return Object.freeze({ intent: "QUOTE_ACTIVITY", activity: "REJECTED", countMode: "DISTINCT_QUOTES", period });
  return null;
}

function recognizeCashPayableIntent(message: string): ManagementIntent | null {
  const previousMonth = /\bgeçen\s+ay\b/iu.test(message);
  if (/(?:kasa(?:mız)?da\s+ne\s+kadar|nakit\s+(?:durumumuz|pozisyonumuz|mevcudumuz)|mevcut\s+nakit)/iu.test(message)) return Object.freeze({ intent: "CASH_POSITION" });
  if (/nakit\s+(?:girişi|çıkışı|hareketimiz|akışımız)/iu.test(message)) {
    const queryMode = /girişi/iu.test(message) ? "INFLOW" : /çıkışı/iu.test(message) ? "OUTFLOW" : /net\s+nakit|nakit\s+hareketimiz/iu.test(message) ? "NET" : "SUMMARY";
    return Object.freeze({ intent: "CASH_FLOW", queryMode, period: previousMonth ? "PREVIOUS_MONTH" : "CURRENT_MONTH" });
  }
  if (!PAYABLE.test(message)) return null;
  if (previousMonth && /(?:yaşlandır|gecik|90)/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "HISTORICAL_UNSUPPORTED" });
  if (/hangi\s+tedarikçilere/iu.test(message) && /(?:gecikmiş|geçikmiş)/iu.test(message) && /(?:en\s+yüksek|fazla)/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "COUNTERPARTY_OVERDUE_RANKING" });
  if (/en\s+büyük[\s\S]*(?:gecikmiş|geçikmiş)/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "LARGEST_OVERDUE" });
  if (/90\s+günden\s+(?:uzun|fazla)/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "OVERDUE_90_PLUS" });
  if (/yaşlandır/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "AGING" });
  if (/önümüzdeki\s+30\s+gün/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_30_DAYS" });
  if (/önümüzdeki\s+14\s+gün/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_14_DAYS" });
  if (/önümüzdeki\s+7\s+gün/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_7_DAYS" });
  if (/bugün[\s\S]*vadesi\s+gel/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "DUE_TODAY" });
  if (/(?:gecikmiş|geçikmiş|vadesi\s+geçmiş)/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "OVERDUE" });
  if (/(?:toplam|ne\s+kadar)[\s\S]*bor/iu.test(message)) return Object.freeze({ intent: "PAYABLE_POSITION", queryMode: "TOTAL" });
  return null;
}

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
  const quoteActivityIntent = recognizeQuoteActivityIntent(normalized);
  if (quoteActivityIntent) return quoteActivityIntent;
  const quotePipelineIntent = recognizeQuotePipelineIntent(normalized);
  if (quotePipelineIntent) return quotePipelineIntent;
  if (FINANCIAL_CONTEXT.test(normalized) && ATTENTION_REQUEST.test(normalized)) {
    return Object.freeze({ intent: "FINANCIAL_ATTENTION" });
  }
  if ((FINANCIAL_CONTEXT.test(normalized) || COMPLETE_FINANCIAL_LIST.test(normalized)) && OVERVIEW_REQUEST.test(normalized)) {
    return Object.freeze({ intent: "FINANCIAL_OVERVIEW" });
  }
  const cashPayableIntent = recognizeCashPayableIntent(normalized);
  if (cashPayableIntent) return cashPayableIntent;
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
  const financialAnswerOnly = managementIntent.intent === "QUOTE_ACTIVITY" || managementIntent.intent === "RECEIVABLE_POSITION" || managementIntent.intent === "CASH_POSITION" || managementIntent.intent === "CASH_FLOW" || managementIntent.intent === "PAYABLE_POSITION" || managementIntent.intent === "FINANCIAL_ATTENTION" || managementIntent.intent === "FINANCIAL_OVERVIEW";
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
    businessNavigation: financialAnswerOnly
      ? null
      : managementIntent.intent === "QUOTE_PIPELINE"
        ? Object.freeze({ operation: "NAVIGATE", domain: "offer", target: "list", entityReference: null })
        : Object.freeze({ operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null }),
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: null,
    reasoning: {
      summary: managementIntent.intent === "QUOTE_PIPELINE"
        ? "Güncel açık teklif pipeline isteği deterministik olarak çözüldü."
        : managementIntent.intent === "QUOTE_ACTIVITY"
        ? "Dönemsel teklif aktivitesi isteği deterministik olarak çözüldü."
        : managementIntent.intent === "FINANCIAL_OVERVIEW"
        ? "Güncel finansal genel görünüm isteği deterministik olarak çözüldü."
        : "Açık dönemli tahsilat performansı isteği deterministik olarak çözüldü.",
      observations: managementIntent.intent === "QUOTE_PIPELINE"
        ? [managementIntent.intent, managementIntent.queryMode]
        : managementIntent.intent === "QUOTE_ACTIVITY"
        ? [managementIntent.intent, managementIntent.activity, managementIntent.countMode, managementIntent.period]
        : managementIntent.intent === "CASH_POSITION" || managementIntent.intent === "FINANCIAL_ATTENTION" || managementIntent.intent === "FINANCIAL_OVERVIEW"
        ? [managementIntent.intent]
        : managementIntent.intent === "RECEIVABLE_POSITION" || managementIntent.intent === "PAYABLE_POSITION" || managementIntent.intent === "CASH_FLOW"
        ? [managementIntent.intent, managementIntent.queryMode]
        : managementIntent.intent === "COLLECTION_PERFORMANCE" || managementIntent.intent === "COLLECTION_TARGET_POSITION"
        ? [managementIntent.intent, managementIntent.period]
        : [managementIntent.intent, managementIntent.primaryPeriod, managementIntent.comparablePeriod],
      uncertainty: [],
      whyThisHandling: managementIntent.intent === "QUOTE_PIPELINE"
        ? "Güncel pipeline yalnızca açık Quote satırlarından yanıtlanır; kanonik Teklifler çalışma alanı destekleyici liste olarak eşlik eder."
        : managementIntent.intent === "QUOTE_ACTIVITY"
        ? "Teklif aktivitesi kanonik Quote zamanları ve tam QuoteEvent kanıtından yanıtlanır; mevcut teklif listesi tarihsel aktiviteyi temsil etmediği için cevap konuşmada kalır."
        : managementIntent.intent === "FINANCIAL_OVERVIEW"
        ? "Finansal genel görünüm kabul edilmiş kanonik finans datasetlerinden yanıtlanır; eşdeğer bir çalışma alanı olmadığı için cevap konuşmada kalır."
        : "Tahsilat performansı Settlement dönem gerçeğinden yanıtlanır; kanonik Tahsilatlar çalışma alanı eşlik eder.",
    },
  });
}
