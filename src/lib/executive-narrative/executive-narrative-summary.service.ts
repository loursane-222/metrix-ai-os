import type {
  ExecutiveNarrativePosture,
} from "./executive-narrative.types";
import type {
  ExecutiveScorecardArea,
  ExecutiveScorecardLevel,
} from "@/lib/executive-scorecard";

const AREA_LABEL: Record<ExecutiveScorecardArea, string> = {
  CASH_HEALTH: "nakit",
  COLLECTION_HEALTH: "tahsilat",
  SALES_PIPELINE_HEALTH: "satis",
  EXECUTION_HEALTH: "icra",
  DECISION_DISCIPLINE: "karar takibi",
  MARKET_EXPOSURE: "piyasa etkisi",
  SIGNAL_MOMENTUM: "risk momentumu",
  DATA_QUALITY: "veri kalitesi",
};

export function buildNarrativeOpeningLine(input: {
  posture: ExecutiveNarrativePosture;
  weakestAreaLabel: string | null;
  hasOverdueDecision: boolean;
}): string {
  if (input.posture === "UNCERTAIN") {
    return "Bugun sirketin genel resmini temkinli okumak gerekiyor; veri tam net degil.";
  }
  if (input.posture === "CRITICAL") {
    return input.weakestAreaLabel
      ? `Bugunun ilk konusu ${input.weakestAreaLabel}; sakin ama gecikmeden ele alinmali.`
      : "Bugun sakin ama gecikmeden ele alinmasi gereken bir risk var.";
  }
  if (input.posture === "PRESSURE") {
    return input.weakestAreaLabel
      ? `Sirket bugun ${input.weakestAreaLabel} tarafinda baski hissediyor.`
      : "Sirket bugun bazi alanlarda baski hissediyor.";
  }
  if (input.hasOverdueDecision) {
    return "Bugun once sahiplenilmis kararlarin sonucunu netlestirmek gerekiyor.";
  }
  if (input.posture === "WATCHFUL") {
    return input.weakestAreaLabel
      ? `${capitalize(input.weakestAreaLabel)} izlenmeli; tablo henuz kritik degil.`
      : "Tablo kritik degil, ama erken sinyaller takip edilmeli.";
  }
  return "Genel tablo sakin; yine de gunluk yonetim ritmini korumak gerekiyor.";
}

export function buildNarrativeExecutiveSummary(input: {
  posture: ExecutiveNarrativePosture;
  weakestAreaLabel: string | null;
  strongestAreaLabel: string | null;
  directionText: string | null;
}): string {
  const direction = input.directionText ? ` Genel yon ${input.directionText}.` : "";

  if (input.posture === "UNCERTAIN") {
    return "Mevcut verilerle kesin bir yon okumasi yapmak dogru olmaz; once eksik sinyaller ayrilmali.";
  }
  if (input.posture === "CRITICAL") {
    return input.weakestAreaLabel
      ? `En zayif halka ${input.weakestAreaLabel}; bugunku okuma risk azaltma odakli olmali.${direction}`
      : `Bugunku okuma risk azaltma odakli olmali.${direction}`;
  }
  if (input.posture === "PRESSURE") {
    return input.weakestAreaLabel
      ? `${input.weakestAreaLabel} baskisi genel yonetim dikkatini one cekiyor.${direction}`
      : `Bazi alanlarda baski var; yonetim dikkatini dagitmadan ilerlemek gerekiyor.${direction}`;
  }
  if (input.posture === "WATCHFUL") {
    return input.weakestAreaLabel
      ? `${input.weakestAreaLabel} izleme alaninda; erken takip yeterli olabilir.${direction}`
      : `Tablo izleme modunda; erken takip yeterli olabilir.${direction}`;
  }
  if (input.strongestAreaLabel) {
    return `Genel tablo sakin; ${input.strongestAreaLabel} tarafinda destekleyici sinyal var.${direction}`;
  }
  return `Genel tablo sakin.${direction}`;
}

export function buildNarrativeManagementMeaning(input: {
  posture: ExecutiveNarrativePosture;
  firstAttention: string | null;
}): string {
  if (input.posture === "UNCERTAIN") {
    return "Bu durum karar vermeden once veri kalitesini ayirmayi ve kesin olmayan yorumlari sinirlamayi gerektirir.";
  }
  if (input.posture === "CRITICAL") {
    return "Bu durum yeni hamleden once en riskli alani daraltmayi ve bugun somut takip yapmayi gerektirir.";
  }
  if (input.posture === "PRESSURE") {
    return "Bu durum buyume ve operasyon kararlarini daha siki takip ritmiyle almayi gerektirir.";
  }
  if (input.posture === "WATCHFUL") {
    return "Bu durum erken sinyalleri kacirmadan, gereksiz panik olusturmadan takip etmeyi gerektirir.";
  }
  return input.firstAttention
    ? "Bu durum mevcut ritmi korurken ilk dikkat alanini acik tutmayi gerektirir."
    : "Bu durum mevcut yonetim ritmini korumayi gerektirir.";
}

export function buildRiskLanguage(input: {
  posture: ExecutiveNarrativePosture;
  criticalCount: number;
  highCount: number;
  trendDirection: string | null;
}): string | null {
  if (input.posture === "CRITICAL") {
    return "Risk dili net olmali: konu onemli, fakat panikle degil sahiplik ve tarih vererek yonetilmeli.";
  }
  if (input.posture === "PRESSURE" || input.highCount > 0) {
    return "Risk dili kontrollu olmali: baski var, ilk takip alani bugun netlestirilmeli.";
  }
  if (input.trendDirection === "RISING") {
    return "Risk dili izleme odakli olmali: sinyaller yukseliyor, erken takip gerekli.";
  }
  return input.criticalCount > 0 ? "Risk dili sakin ama dogrudan olmali." : null;
}

export function buildDataQualityLanguage(input: {
  hasLowConfidence: boolean;
  failedSteps: string[];
  dataQualityNote: string | null;
}): string | null {
  if (input.failedSteps.length > 0) {
    return "Bu okuma sinirli veriyle yapildi; eksik kaynaklar tamamlanmadan kesin hukum kurulmamalı.";
  }
  if (input.hasLowConfidence || input.dataQualityNote) {
    return "Bu okuma temkinli ele alinmali; bazi sinyallerin guveni sinirli.";
  }
  return null;
}

export function buildBriefingNarrative(input: {
  openingLine: string;
  executiveSummary: string;
  firstAttention: string | null;
}): string {
  const parts = [input.openingLine, input.executiveSummary];
  if (input.firstAttention) {
    parts.push(`Ilk dikkat: ${input.firstAttention}`);
  }
  return parts.join(" ");
}

export function buildPromptNarrative(input: {
  openingLine: string;
  managementMeaning: string;
  riskLanguage: string | null;
  dataQualityLanguage: string | null;
}): string {
  return [
    input.openingLine,
    input.managementMeaning,
    input.riskLanguage,
    input.dataQualityLanguage,
  ]
    .filter(Boolean)
    .join(" ");
}

export function scorecardAreaLabel(area: ExecutiveScorecardArea | null): string | null {
  return area ? AREA_LABEL[area] : null;
}

export function directionToText(direction: string | null | undefined): string | null {
  if (direction === "IMPROVING") return "iyilesme sinyali veriyor";
  if (direction === "DETERIORATING") return "zayiflama sinyali veriyor";
  if (direction === "CRITICAL") return "kritik dikkat gerektiriyor";
  if (direction === "STABLE") return "stabil";
  return null;
}

export function levelToPosture(level: ExecutiveScorecardLevel | null | undefined): ExecutiveNarrativePosture {
  if (level === "AT_RISK") return "CRITICAL";
  if (level === "PRESSURED") return "PRESSURE";
  if (level === "WATCH") return "WATCHFUL";
  if (level === "HEALTHY") return "NORMAL";
  return "UNCERTAIN";
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toLocaleUpperCase("tr-TR") + value.slice(1);
}
