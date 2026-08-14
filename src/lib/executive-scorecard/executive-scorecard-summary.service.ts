import type {
  ExecutiveScorecardArea,
  ExecutiveScorecardAreaResult,
  ExecutiveScorecardConfidence,
  ExecutiveScorecardLevel,
} from "./executive-scorecard.types";

const AREA_LABEL: Record<ExecutiveScorecardArea, string> = {
  CASH_HEALTH: "Nakit",
  COLLECTION_HEALTH: "Tahsilat",
  SALES_PIPELINE_HEALTH: "Satış pipeline",
  EXECUTION_HEALTH: "Icra",
  DECISION_DISCIPLINE: "Karar disiplini",
  MARKET_EXPOSURE: "Piyasa etkisi",
  SIGNAL_MOMENTUM: "Sinyal momentumu",
  DATA_QUALITY: "Veri kalitesi",
};

const LEVEL_LABEL: Record<ExecutiveScorecardLevel, string> = {
  HEALTHY: "sağlıklı",
  WATCH: "izlemede",
  PRESSURED: "baskı altında",
  AT_RISK: "risk altında",
  UNKNOWN: "belirsiz",
};

export function buildExecutiveScorecardSummary(input: {
  overallLevel: ExecutiveScorecardLevel;
  weakestArea: ExecutiveScorecardArea | null;
  strongestArea: ExecutiveScorecardArea | null;
  areas: ExecutiveScorecardAreaResult[];
}): string {
  if (input.overallLevel === "UNKNOWN") {
    return "Yönetici puan kartı için yeterli güvenilir veri henüz oluşmadı.";
  }

  const weakest = input.weakestArea ? AREA_LABEL[input.weakestArea] : null;
  const strongest = input.strongestArea ? AREA_LABEL[input.strongestArea] : null;
  const pressureCount = input.areas.filter(
    (area) => area.level === "AT_RISK" || area.level === "PRESSURED",
  ).length;

  if (weakest && strongest && pressureCount > 0) {
    return `Genel şirket sağlığı ${LEVEL_LABEL[input.overallLevel]}; en zayıf alan ${weakest}, en güçlü alan ${strongest}.`;
  }

  if (weakest) {
    return `Genel şirket sağlığı ${LEVEL_LABEL[input.overallLevel]}; ilk takip alanı ${weakest}.`;
  }

  return `Genel şirket sağlığı ${LEVEL_LABEL[input.overallLevel]}.`;
}

export function buildExecutiveScorecardDataQualityNote(input: {
  failedSteps: string[];
  dataLimitations: string[];
  dataQualityArea: ExecutiveScorecardAreaResult;
}): string | null {
  if (input.failedSteps.length > 0) {
    return `Bazı veri kaynakları okunamadı: ${input.failedSteps.slice(0, 3).join(", ")}.`;
  }

  if (input.dataLimitations.length > 0) {
    return `Veri kısıtları: ${input.dataLimitations.slice(0, 2).join(" ")}`;
  }

  if (input.dataQualityArea.level === "UNKNOWN") {
    return "Puan kartı sınırlı veriyle üretildi.";
  }

  return null;
}

export function levelHeadline(
  area: ExecutiveScorecardArea,
  level: ExecutiveScorecardLevel,
): string {
  return `${AREA_LABEL[area]} durumu ${LEVEL_LABEL[level]}.`;
}

export function recommendedAttentionForArea(
  area: ExecutiveScorecardArea,
  level: ExecutiveScorecardLevel,
): string | null {
  if (level === "HEALTHY") return null;

  const map: Record<ExecutiveScorecardArea, string> = {
    CASH_HEALTH: "Nakit girişi, geciken alacaklar ve 30 günlük tahsilat beklentisini birlikte kontrol et.",
    COLLECTION_HEALTH: "Geciken tahsilatları ve açık tahsilat aksiyonlarını net sahiplikle takip et.",
    SALES_PIPELINE_HEALTH: "Sıcak ve bekleyen tekliflerde kapanış/takip tarihlerini netleştir.",
    EXECUTION_HEALTH: "Yaşlanan operasyon aksiyonlarını kapat veya yeni sahiplik ata.",
    DECISION_DISCIPLINE: "Açık ve gecikmiş yönetim kararlarının sonucunu netleştir.",
    MARKET_EXPOSURE: "Piyasa ve kur etkisini fiyatlama, nakit ve teklif kararlarına yansıt.",
    SIGNAL_MOMENTUM: "Yükselen risk sinyallerini günlük yönetim ritminde öne al.",
    DATA_QUALITY: "Eksik veri kaynaklarını tamamla ve düşük güvenli sinyalleri ayır.",
  };

  return map[area];
}

export function confidenceFromEvidence(
  hasPrimarySource: boolean,
  evidenceCount: number,
  hasDataGap: boolean,
): ExecutiveScorecardConfidence {
  if (!hasPrimarySource || hasDataGap) return "LOW";
  return evidenceCount >= 2 ? "HIGH" : "MEDIUM";
}
