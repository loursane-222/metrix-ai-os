import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceComposedResponse } from "./manager-advice-composer.types";
import type { ManagerAdviceGuidance } from "./manager-advice-guidance.types";
import type { ManagerAdviceAnalysis } from "./manager-advice-orchestrator.types";
import type { ManagerAdviceBrief } from "./manager-advice-brief.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";
import type { ManagerAdviceResponseDraft } from "./manager-advice-response-builder.types";

type BuildManagerAdviceGuidanceInput = {
  analysis: ManagerAdviceAnalysis;
  brief: ManagerAdviceBrief;
  responseDraft: ManagerAdviceResponseDraft;
  composedResponse: ManagerAdviceComposedResponse;
};

const SUGGESTED_STRUCTURE_BY_READINESS: Record<
  ManagerAdviceReadinessLevel,
  string[]
> = {
  READY: ["karar özeti", "gerekçe", "risk", "önerilen aksiyon"],
  PARTIAL: [
    "mevcut bilgiyle kısa değerlendirme",
    "eksik bağlam",
    "temkinli öneri",
    "netleşmesi gereken soru",
  ],
  INSUFFICIENT: [
    "önce eksik bilgiyi belirt",
    "varsayımlı tavsiye ver",
    "net karar için gereken bilgileri söyle",
  ],
};

const TONE_BY_READINESS: Record<ManagerAdviceReadinessLevel, string> = {
  READY: "Net, yönetici diliyle ve aksiyona dönük ilerle.",
  PARTIAL:
    "Yön gösterici ama temkinli ol; eksik bağlamı açıkça ayır.",
  INSUFFICIENT:
    "İhtiyatlı ve varsayımlı konuş; kesin hüküm verme ve eksik bilgileri öncele.",
};

const CATEGORY_RISKS: Record<ManagerAdviceCategory, string[]> = {
  PRICING: [
    "Marj etkisi netleşmeden indirim önermek karlılığı zayıflatabilir.",
    "Müşterinin stratejik değeri bilinmeden fiyat kararı ilişki riskini artırabilir.",
  ],
  COLLECTION: [
    "Tahsilat baskısı yanlış tonda kurulursa müşteri ilişkisi zarar görebilir.",
    "Yeni teslimat riski yönetilmezse alacak büyüyebilir.",
  ],
  TEAM: [
    "Kişi problemiyle sistem problemini karıştırmak yanlış aksiyona götürebilir.",
    "Kritik rol etkisi bilinmeden hızlı karar operasyonu aksatabilir.",
  ],
  CUSTOMER_CONFLICT: [
    "Haklılık payı netleşmeden savunmacı yaklaşmak çatışmayı büyütebilir.",
    "Referans riski dikkate alınmazsa itibar maliyeti artabilir.",
  ],
  CASHFLOW: [
    "Gelir problemiyle tahsilat problemini karıştırmak yanlış öncelik yaratabilir.",
    "Nakit görünürlüğü yoksa kısa vadeli kararlar riski büyütebilir.",
  ],
  SALES: [
    "Hedef müşteri tipi net değilse satış önerisi dağılabilir.",
  ],
  OPERATIONS: [
    "Darboğaz kaynağı bilinmeden süreç değişikliği yeni aksaklık yaratabilir.",
  ],
  STRATEGY: [
    "Ana hedef net değilse öneri kısa vadeli fırsata fazla yaslanabilir.",
  ],
  PERSONAL: [
    "Kişisel ritim bilinmeden verilen yönlendirme sürdürülebilir olmayabilir.",
  ],
  HIRING: [
    "Rol kritiklik seviyesi netleşmeden işe alım kararı maliyeti artırabilir.",
  ],
  GENERAL: [
    "Kategori net değilse tavsiye fazla genel kalabilir.",
  ],
};

export function buildManagerAdviceGuidance(
  input: BuildManagerAdviceGuidanceInput,
): ManagerAdviceGuidance {
  const readiness = input.analysis.readiness;

  return {
    keyConsiderations: buildKeyConsiderations(input),
    risks: buildRisks(input.analysis.category, readiness),
    recommendedTone: TONE_BY_READINESS[readiness],
    missingInformation: [...input.brief.missingMemoryKeys],
    suggestedStructure: [...SUGGESTED_STRUCTURE_BY_READINESS[readiness]],
  };
}

function buildKeyConsiderations(
  input: BuildManagerAdviceGuidanceInput,
): string[] {
  const considerations = input.responseDraft.decisionChecklist
    .slice(0, 4)
    .map((step) => step.question);

  if (input.brief.frameworkTitle) {
    considerations.unshift(input.brief.frameworkTitle);
  }

  if (input.composedResponse.message.trim().length > 0) {
    considerations.push("Mevcut cevap iskeletindeki temkin seviyesini koru.");
  }

  return considerations;
}

function buildRisks(
  category: ManagerAdviceCategory,
  readiness: ManagerAdviceReadinessLevel,
): string[] {
  const risks = [...CATEGORY_RISKS[category]];

  if (readiness === "INSUFFICIENT") {
    risks.unshift("Kritik bağlam eksik olduğu için kesin karar tonu risklidir.");
  }

  if (readiness === "PARTIAL") {
    risks.unshift("Eksik bağlam nedeniyle öneri varsayımlı kalabilir.");
  }

  return risks;
}
