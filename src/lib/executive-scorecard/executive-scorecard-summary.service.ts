import type {
  ExecutiveScorecardArea,
  ExecutiveScorecardAreaResult,
  ExecutiveScorecardConfidence,
  ExecutiveScorecardLevel,
} from "./executive-scorecard.types";

const AREA_LABEL: Record<ExecutiveScorecardArea, string> = {
  CASH_HEALTH: "Nakit",
  COLLECTION_HEALTH: "Tahsilat",
  SALES_PIPELINE_HEALTH: "Satis pipeline",
  EXECUTION_HEALTH: "Icra",
  DECISION_DISCIPLINE: "Karar disiplini",
  MARKET_EXPOSURE: "Piyasa etkisi",
  SIGNAL_MOMENTUM: "Sinyal momentumu",
  DATA_QUALITY: "Veri kalitesi",
};

const LEVEL_LABEL: Record<ExecutiveScorecardLevel, string> = {
  HEALTHY: "saglikli",
  WATCH: "izlemede",
  PRESSURED: "baski altinda",
  AT_RISK: "risk altinda",
  UNKNOWN: "belirsiz",
};

export function buildExecutiveScorecardSummary(input: {
  overallLevel: ExecutiveScorecardLevel;
  weakestArea: ExecutiveScorecardArea | null;
  strongestArea: ExecutiveScorecardArea | null;
  areas: ExecutiveScorecardAreaResult[];
}): string {
  if (input.overallLevel === "UNKNOWN") {
    return "Yonetici scorecard icin yeterli guvenilir veri henuz olusmadi.";
  }

  const weakest = input.weakestArea ? AREA_LABEL[input.weakestArea] : null;
  const strongest = input.strongestArea ? AREA_LABEL[input.strongestArea] : null;
  const pressureCount = input.areas.filter(
    (area) => area.level === "AT_RISK" || area.level === "PRESSURED",
  ).length;

  if (weakest && strongest && pressureCount > 0) {
    return `Genel sirket sagligi ${LEVEL_LABEL[input.overallLevel]}; en zayif alan ${weakest}, en guclu alan ${strongest}.`;
  }

  if (weakest) {
    return `Genel sirket sagligi ${LEVEL_LABEL[input.overallLevel]}; ilk takip alani ${weakest}.`;
  }

  return `Genel sirket sagligi ${LEVEL_LABEL[input.overallLevel]}.`;
}

export function buildExecutiveScorecardDataQualityNote(input: {
  failedSteps: string[];
  dataLimitations: string[];
  dataQualityArea: ExecutiveScorecardAreaResult;
}): string | null {
  if (input.failedSteps.length > 0) {
    return `Bazi veri kaynaklari okunamadi: ${input.failedSteps.slice(0, 3).join(", ")}.`;
  }

  if (input.dataLimitations.length > 0) {
    return `Veri kisitlari: ${input.dataLimitations.slice(0, 2).join(" ")}`;
  }

  if (input.dataQualityArea.level === "UNKNOWN") {
    return "Scorecard sinirli veriyle uretildi.";
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
    CASH_HEALTH: "Nakit girisi, geciken alacaklar ve 30 gunluk tahsilat beklentisini birlikte kontrol et.",
    COLLECTION_HEALTH: "Geciken tahsilatlari ve acik tahsilat aksiyonlarini net sahiplikle takip et.",
    SALES_PIPELINE_HEALTH: "Sicak ve bekleyen tekliflerde kapanis/takip tarihlerini netlestir.",
    EXECUTION_HEALTH: "Yaslanan operasyon aksiyonlarini kapat veya yeni sahiplik ata.",
    DECISION_DISCIPLINE: "Acik ve gecikmis yonetim kararlarinin sonucunu netlestir.",
    MARKET_EXPOSURE: "Piyasa ve kur etkisini fiyatlama, nakit ve teklif kararlarina yansit.",
    SIGNAL_MOMENTUM: "Yukselen risk sinyallerini gunluk yonetim ritminde one al.",
    DATA_QUALITY: "Eksik veri kaynaklarini tamamla ve dusuk guvenli sinyalleri ayir.",
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
