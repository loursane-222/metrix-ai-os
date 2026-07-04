import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceResponseDraft } from "./manager-advice-response-builder.types";
import type { ManagerAdviceComposedResponse } from "./manager-advice-composer.types";

const CATEGORY_GUIDANCE: Record<ManagerAdviceCategory, string> = {
  PRICING:
    "Fiyatı hemen düşürmek yerine önce değer algısını, marj etkisini ve indirim dışı seçenekleri netleştir.",
  COLLECTION:
    "İlk gecikme ile kronik gecikmeyi ayır. Yıllardır çalışan ve ilk kez aksayan müşteriye ilk hamlede sert çıkma; ama belirsizliği de kabul etme. Bugün ara, net ödeme tarihi ve net tutar iste, bunu yazılı ödeme sözüne bağla. Yeni iş veya teslimat varsa ödeme planı yazılı hale gelmeden ilerleme. Açık bakiye ve nakit etkisini artık risk limiti gibi yönet.",
  TEAM:
    "Ekip kararında önce sorunun kişi mi sistem mi olduğunu ayır; kritik rol, performans geçmişi ve yerine koyma maliyetini birlikte değerlendir.",
  CUSTOMER_CONFLICT:
    "Müşteri çatışmasında önce haklılık payını, beklenti yönetimini ve finansal etkiyi netleştir; uzlaşma maliyetini itibar riskiyle birlikte düşün.",
  CASHFLOW:
    "Nakit akışında önce problemin gelirden mi tahsilattan mı geldiğini ayır; en büyük çıkışı ve hızlandırılabilir alacakları görünür hale getir.",
  SALES:
    "Satış kararında önce hedef müşteri tipini, stratejik odağı ve dönüşüm engelini netleştir.",
  OPERATIONS:
    "Operasyon kararında önce darboğazı, ekip kapasitesini ve sürecin tekrar eden aksama noktasını bul.",
  STRATEGY:
    "Stratejik kararda önce ana hedefi ve mevcut odağı netleştir; kısa vadeli fırsatı uzun vadeli yönle karşılaştır.",
  PERSONAL:
    "Kişisel kararda önce çalışma tercihini ve seni zorlayan ana baskıyı netleştir; kararı sürdürülebilir ritme göre değerlendir.",
  HIRING:
    "İşe alım kararında önce rolün kritikliği, mevcut ekip kapasitesi ve yerine koyma ihtiyacını netleştir.",
  GENERAL:
    "Bugün önce ticari etkiyi, nakit veya zaman kaybını ve geri dönüşü zor riski ayır. Sonra en küçük ama sonucu değiştirecek aksiyonu seç; eksik bilgi varsa varsayımını açık tut ve yine de adımı at.",
};

export function composeManagerAdviceResponse(
  draft: ManagerAdviceResponseDraft,
): ManagerAdviceComposedResponse {
  const messageParts = [
    draft.opening,
    buildContextSentence(draft),
    CATEGORY_GUIDANCE[draft.category],
    buildChecklistSentence(draft),
    buildReadinessClosing(draft),
  ].filter(Boolean);

  return {
    category: draft.category,
    readiness: draft.readiness,
    message: messageParts.join(" "),
  };
}

function buildContextSentence(draft: ManagerAdviceResponseDraft): string | null {
  if (draft.missingContextNote) {
    return draft.missingContextNote;
  }

  if (draft.knownContextNote) {
    return draft.knownContextNote;
  }

  return null;
}

function buildChecklistSentence(
  draft: ManagerAdviceResponseDraft,
): string | null {
  const checklistQuestions = draft.decisionChecklist
    .slice(0, 3)
    .map((step) => step.question);

  if (checklistQuestions.length === 0) {
    return null;
  }

  return `Bugünkü aksiyonu seçmeden önce şu noktaları hızlıca kontrol et: ${checklistQuestions.join(
    " ",
  )}`;
}

function buildReadinessClosing(draft: ManagerAdviceResponseDraft): string {
  if (draft.readiness === "READY") {
    return "Bu noktada kararı uzatmadan aksiyona çevirmelisin.";
  }

  if (draft.readiness === "PARTIAL") {
    return "Eksik bilgiler yönü değiştirebilir; yine de ilk adımı kontrollü şekilde bugün atabilirsin.";
  }

  return "Kesin hüküm için eksikler var; yine de riski büyütmeden ilk adımı bugün belirlemelisin.";
}
