import type { ManagerAdviceBrief } from "./manager-advice-brief.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";
import type { ManagerAdviceResponseDraft } from "./manager-advice-response-builder.types";

const OPENING_BY_READINESS: Record<ManagerAdviceReadinessLevel, string> = {
  READY:
    "Burada vakit kaybetmeden ticari etkiyi sınırlayan ve bugünkü aksiyonu netleştiren bir karar almalısın.",
  PARTIAL:
    "Bazı bilgiler eksik olsa da bekleme; varsayımını net tutup riski büyütmeden ilk kontrollü adımı bugün atmalısın.",
  INSUFFICIENT:
    "Kritik bilgiler eksik olduğu için kesin hüküm verme; yine de riski artırmadan uygulanacak ilk adımı belirle.",
};

const RECOMMENDED_STRUCTURE = [
  "Yönetici değerlendirmesini yap",
  "Ticari riski ve nakit etkisini ayır",
  "İlişki, operasyon ve karlılık etkisini tart",
  "Varsayımı açık söyle",
  "Bugünkü net aksiyonu belirle",
] as const;

const CATEGORY_OPENING_BY_READINESS: Partial<
  Record<
    ManagerAdviceCategory,
    Partial<Record<ManagerAdviceReadinessLevel, string>>
  >
> = {
  COLLECTION: {
    READY:
      "Bu bir tahsilat meselesi ama sadece para isteme konusu değil; müşteri ilişkisi, açık bakiye ve yeni iş riskini birlikte yönetmelisin.",
    PARTIAL:
      "Bu tahsilat sorunu ama sadece para isteme konusu değil; ilişkiyi, açık bakiyeyi ve yeni teslimat riskini birlikte yönetmelisin.",
    INSUFFICIENT:
      "Açık bakiye ve müşteri geçmişi net olmasa bile bu gecikmeyi risk limiti gibi ele almalı, ilişkiyi yakmadan belirsizliği kapatmalısın.",
  },
};

export function buildManagerAdviceResponseDraft(
  brief: ManagerAdviceBrief,
): ManagerAdviceResponseDraft {
  return {
    category: brief.category,
    readiness: brief.readiness,
    opening: buildOpening(brief),
    knownContextNote: buildKnownContextNote(brief),
    missingContextNote: buildMissingContextNote(brief),
    decisionChecklist: brief.frameworkSteps.map((step) => ({ ...step })),
    recommendedStructure: [...RECOMMENDED_STRUCTURE],
  };
}

function buildOpening(brief: ManagerAdviceBrief): string {
  return (
    CATEGORY_OPENING_BY_READINESS[brief.category]?.[brief.readiness] ??
    OPENING_BY_READINESS[brief.readiness]
  );
}

function buildKnownContextNote(brief: ManagerAdviceBrief): string | null {
  if (brief.knownMemoryKeys.length === 0) {
    return null;
  }

  return `Bu değerlendirmede mevcut bağlam olarak şunları kullanabilirim: ${brief.knownMemoryKeys.join(
    ", ",
  )}.`;
}

function buildMissingContextNote(brief: ManagerAdviceBrief): string | null {
  if (brief.missingMemoryKeys.length === 0) {
    return null;
  }

  return `Daha sağlıklı değerlendirme için eksik bağlamlar: ${brief.missingMemoryKeys.join(
    ", ",
  )}.`;
}
