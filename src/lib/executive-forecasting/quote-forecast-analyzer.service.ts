import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteConversionIntelligence } from "@/lib/core/quotes/quote-conversion-intelligence-builder";
import type { ForecastRiskSignal, ForecastEvidence } from "./executive-forecasting.types";

const STALE_QUOTE_DAYS = 14;

export function analyzeQuoteForecast(
  quoteContext: QuoteContext | null | undefined,
  conversionIntelligence: QuoteConversionIntelligence | null | undefined,
): ForecastRiskSignal | null {
  if (!quoteContext || quoteContext.openCount === 0) return null;

  const evidence: ForecastEvidence[] = [];
  const limitations: string[] = [];
  const now = new Date();

  evidence.push({
    dataPoint: "Açık teklif adedi ve toplam tutarı",
    value: `${quoteContext.openCount} teklif, ₺${quoteContext.openTotal.toLocaleString("tr-TR")}`,
    source: "quote",
  });

  const staleItems = quoteContext.activeItems.filter((item) => {
    const ref = item.sentAt ?? item.createdAt;
    const days = Math.floor((now.getTime() - ref.getTime()) / 86400000);
    return days >= STALE_QUOTE_DAYS;
  });

  if (staleItems.length > 0) {
    evidence.push({
      dataPoint: `${STALE_QUOTE_DAYS}+ gün hareketsiz teklif`,
      value: `${staleItems.length} adet`,
      source: "quote",
    });
  }

  let winRate: number | null = null;
  if (conversionIntelligence?.hasEnoughData) {
    winRate = conversionIntelligence.winRate;
    evidence.push({
      dataPoint: "Geçmiş kazanma oranı",
      value: `%${Math.round(winRate * 100)} (son ${conversionIntelligence.lookbackDays} gun)`,
      source: "quote",
    });
    if (conversionIntelligence.dominantLossPattern !== "UNKNOWN") {
      evidence.push({
        dataPoint: "Dominant kayip deseni",
        value: conversionIntelligence.dominantLossPattern,
        source: "quote",
      });
    }
  } else {
    limitations.push("Dönüşüm oranı analizi için yeterli kapalı teklif verisi yok.");
  }

  const staleRatio = quoteContext.openCount > 0 ? staleItems.length / quoteContext.openCount : 0;
  const lowWinRate = winRate !== null && winRate < 0.25;
  const highStale = staleRatio >= 0.5;

  const riskLevel =
    (lowWinRate && highStale)
      ? "HIGH"
      : highStale || lowWinRate
        ? "WATCH"
        : "LOW";

  const confidenceScore = winRate !== null ? 0.72 : 0.40;
  const confidence = confidenceScore >= 0.65 ? "HIGH" : "MEDIUM";

  const headline = buildQuoteHeadline(riskLevel, quoteContext.openCount, quoteContext.openTotal, staleItems.length, winRate);
  const explanation = buildQuoteExplanation(quoteContext, staleItems.length, staleRatio, winRate, conversionIntelligence);
  const actionableStep = staleItems.length > 0
    ? `${staleItems[0].customerName} — ${staleItems[0].title} teklifi ${STALE_QUOTE_DAYS}+ gündür bekliyor; müşteri ile iletişime geç.`
    : null;

  return {
    riskType: "QUOTE_CONVERSION",
    riskLevel,
    confidence,
    confidenceScore,
    headline,
    explanation,
    actionableStep,
    evidence,
    dataLimitations: limitations,
  };
}

function buildQuoteHeadline(
  riskLevel: string,
  openCount: number,
  openTotal: number,
  staleCount: number,
  winRate: number | null,
): string {
  if (riskLevel === "HIGH") {
    return `Teklif dönüşüm riski yüksek: ${openCount} açık teklif (₺${openTotal.toLocaleString("tr-TR")}), kazanma oranı düşük veya teklifler takipsiz.`;
  }
  if (riskLevel === "WATCH") {
    return staleCount > 0
      ? `${staleCount} teklif ${STALE_QUOTE_DAYS}+ gündür hareketsiz; dönüşüm takip edilmeli.`
      : `Kazanma oranı %${winRate !== null ? Math.round(winRate * 100) : "?"}; teklif kalitesi izlenmeli.`;
  }
  return `${openCount} açık teklif pipeline'da; dönüşüm riski sınırlı.`;
}

function buildQuoteExplanation(
  context: QuoteContext,
  staleCount: number,
  staleRatio: number,
  winRate: number | null,
  conversion: QuoteConversionIntelligence | null | undefined,
): string {
  const parts: string[] = [];
  parts.push(`Pipeline'da ${context.openCount} açık teklif, toplam ₺${context.openTotal.toLocaleString("tr-TR")}.`);
  if (staleCount > 0) {
    parts.push(`Bu tekliflerin %${Math.round(staleRatio * 100)}'i (${staleCount} adet) ${STALE_QUOTE_DAYS}+ gündür hareketsiz.`);
  }
  if (winRate !== null) {
    parts.push(`Geçmiş kazanma oranı: %${Math.round(winRate * 100)}.`);
  }
  if (conversion?.dominantLossPattern && conversion.dominantLossPattern !== "UNKNOWN") {
    parts.push(`Baskin kayip nedeni: ${conversion.dominantLossPattern}.`);
  }
  return parts.join(" ");
}
