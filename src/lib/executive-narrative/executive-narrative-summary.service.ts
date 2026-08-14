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
  SALES_PIPELINE_HEALTH: "satış",
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
    return "Bugün şirketin genel resmini temkinli okumak gerekiyor; veri tam net değil.";
  }
  if (input.posture === "CRITICAL") {
    return input.weakestAreaLabel
      ? `Bugünün ilk konusu ${input.weakestAreaLabel}; sakin ama gecikmeden ele alınmalı.`
      : "Bugün sakin ama gecikmeden ele alınması gereken bir risk var.";
  }
  if (input.posture === "PRESSURE") {
    return input.weakestAreaLabel
      ? `Şirket bugün ${input.weakestAreaLabel} tarafında baskı hissediyor.`
      : "Şirket bugün bazı alanlarda baskı hissediyor.";
  }
  if (input.hasOverdueDecision) {
    return "Bugün önce sahiplenilmiş kararların sonucunu netleştirmek gerekiyor.";
  }
  if (input.posture === "WATCHFUL") {
    return input.weakestAreaLabel
      ? `${capitalize(input.weakestAreaLabel)} izlenmeli; tablo henüz kritik değil.`
      : "Tablo kritik değil, ama erken sinyaller takip edilmeli.";
  }
  return "Genel tablo sakin; yine de günlük yönetim ritmini korumak gerekiyor.";
}

export function buildNarrativeExecutiveSummary(input: {
  posture: ExecutiveNarrativePosture;
  weakestAreaLabel: string | null;
  strongestAreaLabel: string | null;
  directionText: string | null;
}): string {
  const direction = input.directionText ? ` Genel yön ${input.directionText}.` : "";

  if (input.posture === "UNCERTAIN") {
    return "Mevcut verilerle kesin bir yön okuması yapmak doğru olmaz; önce eksik sinyaller ayrılmalı.";
  }
  if (input.posture === "CRITICAL") {
    return input.weakestAreaLabel
      ? `En zayıf halka ${input.weakestAreaLabel}; bugünkü okuma risk azaltma odaklı olmalı.${direction}`
      : `Bugünkü okuma risk azaltma odaklı olmalı.${direction}`;
  }
  if (input.posture === "PRESSURE") {
    return input.weakestAreaLabel
      ? `${input.weakestAreaLabel} baskısı genel yönetim dikkatini öne çekiyor.${direction}`
      : `Bazı alanlarda baskı var; yönetim dikkatini dağıtmadan ilerlemek gerekiyor.${direction}`;
  }
  if (input.posture === "WATCHFUL") {
    return input.weakestAreaLabel
      ? `${input.weakestAreaLabel} izleme alanında; erken takip yeterli olabilir.${direction}`
      : `Tablo izleme modunda; erken takip yeterli olabilir.${direction}`;
  }
  if (input.strongestAreaLabel) {
    return `Genel tablo sakin; ${input.strongestAreaLabel} tarafında destekleyici sinyal var.${direction}`;
  }
  return `Genel tablo sakin.${direction}`;
}

export function buildNarrativeManagementMeaning(input: {
  posture: ExecutiveNarrativePosture;
  firstAttention: string | null;
}): string {
  if (input.posture === "UNCERTAIN") {
    return "Bu durum karar vermeden önce veri kalitesini ayırmayı ve kesin olmayan yorumları sınırlamayı gerektirir.";
  }
  if (input.posture === "CRITICAL") {
    return "Bu durum yeni hamleden önce en riskli alanı daraltmayı ve bugün somut takip yapmayı gerektirir.";
  }
  if (input.posture === "PRESSURE") {
    return "Bu durum büyüme ve operasyon kararlarını daha sıkı takip ritmiyle almayı gerektirir.";
  }
  if (input.posture === "WATCHFUL") {
    return "Bu durum erken sinyalleri kaçırmadan, gereksiz panik oluşturmadan takip etmeyi gerektirir.";
  }
  return input.firstAttention
    ? "Bu durum mevcut ritmi korurken ilk dikkat alanını açık tutmayı gerektirir."
    : "Bu durum mevcut yönetim ritmini korumayı gerektirir.";
}

export function buildRiskLanguage(input: {
  posture: ExecutiveNarrativePosture;
  criticalCount: number;
  highCount: number;
  trendDirection: string | null;
}): string | null {
  if (input.posture === "CRITICAL") {
    return "Risk dili net olmalı: konu önemli, fakat panikle değil sahiplik ve tarih vererek yönetilmeli.";
  }
  if (input.posture === "PRESSURE" || input.highCount > 0) {
    return "Risk dili kontrollü olmalı: baskı var, ilk takip alanı bugün netleştirilmeli.";
  }
  if (input.trendDirection === "RISING") {
    return "Risk dili izleme odaklı olmalı: sinyaller yükseliyor, erken takip gerekli.";
  }
  return input.criticalCount > 0 ? "Risk dili sakin ama dogrudan olmali." : null;
}

export function buildDataQualityLanguage(input: {
  hasLowConfidence: boolean;
  failedSteps: string[];
  dataQualityNote: string | null;
}): string | null {
  if (input.failedSteps.length > 0) {
    return "Bu okuma sınırlı veriyle yapıldı; eksik kaynaklar tamamlanmadan kesin hüküm kurulmamalı.";
  }
  if (input.hasLowConfidence || input.dataQualityNote) {
    return "Bu okuma temkinli ele alınmalı; bazı sinyallerin güveni sınırlı.";
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
