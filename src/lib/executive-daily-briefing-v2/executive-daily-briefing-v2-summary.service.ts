import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type {
  ExecutiveDailyBriefingV2FirstAction,
  ExecutiveDailyBriefingV2WatchSignal,
} from "./executive-daily-briefing-v2.types";

const DEFAULT_HEADLINE =
  "Bugun icin yonetim ozeti hazir; oncelikler ve takip basliklari tek ekranda toplandi.";
const DEFAULT_DATA_QUALITY_NOTE =
  "Bazi isletme sinyalleri henuz sinirli olabilir; ozeti mevcut kayitlar ve bugunku brifing uzerinden degerlendirin.";
const DEFAULT_FORECAST_SUMMARY =
  "Tahmin ozeti icin yeterli isletme sinyali henuz olusmadi.";
const DEFAULT_SIGNAL_TREND_SUMMARY =
  "Son sinyal trendi icin yeterli gecmis veri bulunmuyor.";
const DEFAULT_AWARENESS_SUMMARY =
  "Sirketin genel yonu icin yeterli farkindalik sinyali henuz olusmadi.";
const DEFAULT_SCORECARD_SUMMARY =
  "Sirket sagligi alan bazli olcmek icin yeterli scorecard sinyali henuz olusmadi.";
const DEFAULT_EXECUTIVE_NARRATIVE_SUMMARY =
  "Bugunun yonetici anlatimi icin yeterli sinyal henuz olusmadi.";
const DEFAULT_EXECUTIVE_FOCUS_SUMMARY =
  "Bugunun ana yonetim odagi icin yeterli sinyal henuz olusmadi.";

export function buildExecutiveDailyBriefingHeadline(input: {
  briefingPackage: BriefingPackage;
  operatingContext: ExecutiveOperatingContext;
}): string {
  const overdue = input.operatingContext.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue) {
    return `Bugunun ilk konusu: "${overdue.title}" kararinin sonucu bekleniyor.`;
  }

  const firstPriority = input.operatingContext.executiveRhythm?.priorities[0];
  if (firstPriority) {
    return `Bugunun ilk odagi: ${firstPriority.headline}`;
  }

  const topAlert = input.operatingContext.executiveAlerts?.criticalAlerts[0];
  if (topAlert) {
    return `Bugunun kritik uyarisi: ${topAlert.headline}`;
  }

  const topMarketItem = input.briefingPackage.kritikItems[0];
  if (topMarketItem) {
    return `Piyasa tarafinda ilk takip: ${topMarketItem.headline}`;
  }

  return DEFAULT_HEADLINE;
}

export function buildExecutiveDailyBriefingFirstAction(input: {
  briefingPackage: BriefingPackage;
  operatingContext: ExecutiveOperatingContext;
}): ExecutiveDailyBriefingV2FirstAction {
  const overdue = input.operatingContext.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue) {
    return {
      title: overdue.title,
      reason: "Daha once sahiplenilen bir karar icin takip zamani geldi.",
      actionHint: overdue.actionHint ?? "Kararin sonucunu netlestir.",
      source: "Karar takibi",
    };
  }

  const firstPriority = input.operatingContext.executiveRhythm?.priorities[0];
  if (firstPriority) {
    return {
      title: firstPriority.headline,
      reason: firstPriority.focus,
      actionHint: firstPriority.actionHint,
      source: sourceLabel(firstPriority.source),
    };
  }

  const criticalAlert = input.operatingContext.executiveAlerts?.criticalAlerts[0];
  if (criticalAlert) {
    return {
      title: criticalAlert.headline,
      reason: "Bugun aksiyon gerektiren kritik uyari.",
      actionHint: criticalAlert.actionableStep,
      source: "Yonetim uyarisi",
    };
  }

  const marketItem = input.briefingPackage.kritikItems[0] ?? input.briefingPackage.dikkatItems[0];
  if (marketItem) {
    return {
      title: marketItem.headline,
      reason: "Dis gelismelerde takip edilmesi gereken baslik.",
      actionHint: marketItem.yonetim_onerisi || null,
      source: "Piyasa brifingi",
    };
  }

  return {
    title: "Gunun onceliklerini gozden gecir.",
    reason: "Kritik bir uyari veya takip karari bulunmuyor.",
    actionHint: "Nakit, teklif ve tahsilat basliklarini rutin olarak kontrol et.",
    source: "Gunluk yonetim ritmi",
  };
}

export function buildExecutiveDailyBriefingDataQualityNote(
  operatingContext: ExecutiveOperatingContext,
): string {
  const note = operatingContext.executiveForecast?.dataQualityNote?.trim();
  if (note) return note;

  if (operatingContext.diagnostics.failedSteps.length > 0) {
    return "Bazi veri kaynaklari okunamadigi icin ozet kismi sinirli veriyle hazirlandi.";
  }

  return DEFAULT_DATA_QUALITY_NOTE;
}

export function buildExecutiveDailyBriefingForecastSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.executiveForecast?.executiveSummary?.trim() || DEFAULT_FORECAST_SUMMARY;
}

export function buildExecutiveDailyBriefingAwarenessSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.executiveAwareness?.primaryNarrative?.trim() || DEFAULT_AWARENESS_SUMMARY;
}

export function buildExecutiveDailyBriefingScorecardSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.executiveScorecard?.summary?.trim() || DEFAULT_SCORECARD_SUMMARY;
}

export function buildExecutiveDailyBriefingNarrativeSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.executiveNarrative?.briefingNarrative?.trim() || DEFAULT_EXECUTIVE_NARRATIVE_SUMMARY;
}

export function buildExecutiveDailyBriefingFocusSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.executiveFocus?.focusSummary?.trim() || DEFAULT_EXECUTIVE_FOCUS_SUMMARY;
}

export function buildExecutiveDailyBriefingSignalTrendSummary(
  operatingContext: ExecutiveOperatingContext,
): string {
  return operatingContext.signal.trendContext?.formattedSummary?.trim() || DEFAULT_SIGNAL_TREND_SUMMARY;
}

export function buildExecutiveDailyBriefingFallbackWatchSignal(): ExecutiveDailyBriefingV2WatchSignal {
  return {
    title: "Izlenecek yeni kritik sinyal yok.",
    reason: "Mevcut verilere gore bugun icin ayrica izlenecek sinyal olusmadi.",
    actionHint: null,
    source: "Gunluk yonetim ozeti",
  };
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "alert":
      return "Yonetim uyarisi";
    case "forecast":
      return "Tahmin ozeti";
    case "briefing":
      return "Piyasa brifingi";
    case "commitment":
    case "decision":
      return "Karar takibi";
    case "quote":
      return "Teklif takibi";
    case "payment":
      return "Tahsilat takibi";
    default:
      return "Gunluk yonetim ritmi";
  }
}

export function urgencyLabel(urgency: string): string {
  switch (urgency) {
    case "TODAY":
      return "Bugun";
    case "THIS_WEEK":
      return "Bu hafta";
    default:
      return "Takip";
  }
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "Kritik";
    case "HIGH":
      return "Yuksek";
    case "WATCH":
      return "Izle";
    default:
      return "Takip";
  }
}

export function priorityLabel(priority: string | null): string | null {
  switch (priority) {
    case "CRITICAL":
      return "Kritik";
    case "HIGH":
      return "Yuksek";
    case "MEDIUM":
      return "Orta";
    case "WATCH":
      return "Izle";
    case "LOW":
      return "Dusuk";
    default:
      return null;
  }
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "SUCCESS":
      return "Basarili";
    case "FAILURE":
      return "Basarisiz";
    case "ABANDONED":
      return "Vazgecildi";
    default:
      return "Sonuc kaydi";
  }
}
