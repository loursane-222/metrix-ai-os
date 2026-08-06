import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";
import type {
  ExecutiveDailyBriefingV2FirstAction,
  ExecutiveDailyBriefingV2WatchSignal,
} from "./executive-daily-briefing-v2.types";

export const DEFAULT_HEADLINE =
  "Bugün için yönetim özeti hazır; öncelikler ve takip başlıkları tek ekranda toplandı.";
const DEFAULT_DATA_QUALITY_NOTE =
  "Bazı işletme sinyalleri henüz sınırlı olabilir; özeti mevcut kayıtlar ve bugünkü brifing üzerinden değerlendirin.";
const DEFAULT_FORECAST_SUMMARY =
  "Tahmin özeti için yeterli işletme sinyali henüz oluşmadı.";
const DEFAULT_SIGNAL_TREND_SUMMARY =
  "Son sinyal trendi icin yeterli gecmis veri bulunmuyor.";
const DEFAULT_AWARENESS_SUMMARY =
  "Şirketin genel yönü için yeterli farkındalık sinyali henüz oluşmadı.";
const DEFAULT_SCORECARD_SUMMARY =
  "Şirket sağlığını alan bazlı ölçmek için yeterli scorecard sinyali henüz oluşmadı.";
const DEFAULT_EXECUTIVE_NARRATIVE_SUMMARY =
  "Bugünün yönetici anlatımı için yeterli sinyal henüz oluşmadı.";
const DEFAULT_EXECUTIVE_FOCUS_SUMMARY =
  "Bugünün ana yönetim odağı için yeterli sinyal henüz oluşmadı.";

export function buildExecutiveDailyBriefingHeadline(input: {
  briefingPackage: BriefingPackage;
  operatingContext: ExecutiveOperatingContext;
}): string {
  const overdue = input.operatingContext.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue) {
    return `Bugünün ilk konusu: "${overdue.title}" kararının sonucu bekleniyor.`;
  }

  const firstPriority = input.operatingContext.executiveRhythm?.priorities[0];
  if (firstPriority) {
    return `Bugünün ilk odağı: ${firstPriority.headline}`;
  }

  const topAlert = input.operatingContext.executiveAlerts?.criticalAlerts[0];
  if (topAlert) {
    return `Bugünün kritik uyarısı: ${topAlert.headline}`;
  }

  const topMarketItem = input.briefingPackage.kritikItems[0];
  if (topMarketItem) {
    return `Piyasa tarafinda ilk takip: ${topMarketItem.headline}`;
  }

  const openDecision = input.operatingContext.executiveDecisionContext?.openDecisions[0];
  if (openDecision) {
    return `Bugünün karar takibi: "${openDecision.title}".`;
  }

  const latestOutcome = input.operatingContext.executiveDecisionContext?.latestOutcome;
  if (latestOutcome) {
    return `Son karar sonucu: "${latestOutcome.decisionTitle}" icin ${latestOutcome.outcome}.`;
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
      actionHint: overdue.actionHint ?? "Kararın sonucunu netleştir.",
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
      reason: "Bugün aksiyon gerektiren kritik uyarı.",
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

  const openDecision = input.operatingContext.executiveDecisionContext?.openDecisions[0];
  if (openDecision) {
    return {
      title: openDecision.title,
      reason: openDecision.rationale,
      actionHint: openDecision.actionHint,
      source: "Karar takibi",
    };
  }

  const latestOutcome = input.operatingContext.executiveDecisionContext?.latestOutcome;
  if (latestOutcome) {
    return {
      title: latestOutcome.decisionTitle,
      reason: latestOutcome.summary ?? `Karar sonucu: ${latestOutcome.outcome}.`,
      actionHint: null,
      source: "Karar sonucu",
    };
  }

  return {
    title: "Gunun onceliklerini gozden gecir.",
    reason: "Kritik bir uyari veya takip karari bulunmuyor.",
    actionHint: "Nakit, teklif ve tahsilat basliklarini rutin olarak kontrol et.",
    source: "Günlük yönetim ritmi",
  };
}

export function buildExecutiveDailyBriefingDataQualityNote(
  operatingContext: ExecutiveOperatingContext,
): string {
  const note = operatingContext.executiveForecast?.dataQualityNote?.trim();
  if (note) return note;

  if (operatingContext.diagnostics.failedSteps.length > 0) {
    return "Bazı veri kaynakları okunamadığı için özet kısmı sınırlı veriyle hazırlandı.";
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
    title: "İzlenecek yeni kritik sinyal yok.",
    reason: "Mevcut verilere göre bugün için ayrıca izlenecek sinyal oluşmadı.",
    actionHint: null,
    source: "Günlük yönetim özeti",
  };
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "alert":
      return "Yonetim uyarisi";
    case "forecast":
      return "Tahmin özeti";
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
      return "Günlük yönetim ritmi";
  }
}

export function urgencyLabel(urgency: string): string {
  switch (urgency) {
    case "TODAY":
      return "Bugün";
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
