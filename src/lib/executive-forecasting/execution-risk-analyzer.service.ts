import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteConversionIntelligence } from "@/lib/core/quotes/quote-conversion-intelligence-builder";
import type { ForecastRiskSignal, ForecastEvidence } from "./executive-forecasting.types";

const STALE_ACTION_DAYS = 5;
const STALE_QUOTE_DAYS = 21;
const HIGH_STALE_ACTION_THRESHOLD = 3;
const HIGH_STALE_QUOTE_THRESHOLD = 3;

export function analyzeExecutionRisk(
  collectionActionContext: CollectionActionContext | null | undefined,
  quoteContext: QuoteContext | null | undefined,
  conversionIntelligence: QuoteConversionIntelligence | null | undefined,
): ForecastRiskSignal | null {
  const now = new Date();

  const staleActions = (collectionActionContext?.items ?? []).filter(
    (item) => item.daysOpen >= STALE_ACTION_DAYS && item.status === "OPEN",
  );

  const staleQuotes = (quoteContext?.activeItems ?? []).filter((item) => {
    const ref = item.updatedAt ?? item.createdAt;
    const days = Math.floor((now.getTime() - ref.getTime()) / 86400000);
    return days >= STALE_QUOTE_DAYS;
  });

  const totalStaleItems = staleActions.length + staleQuotes.length;

  if (totalStaleItems === 0) return null;

  const evidence: ForecastEvidence[] = [];
  const limitations: string[] = [];

  if (staleActions.length > 0) {
    evidence.push({
      dataPoint: `${STALE_ACTION_DAYS}+ gün aksiyona alınmamış tahsilat aksiyonu`,
      value: `${staleActions.length} adet`,
      source: "collection_action",
    });
  }

  if (staleQuotes.length > 0) {
    evidence.push({
      dataPoint: `${STALE_QUOTE_DAYS}+ gün güncellenmemiş açık teklif`,
      value: `${staleQuotes.length} adet`,
      source: "quote",
    });
  }

  if (conversionIntelligence?.dominantLossPattern === "VIEWED_NO_FOLLOWUP") {
    evidence.push({
      dataPoint: "Dönüşüm pattern",
      value: "Görüntülenen teklifler takip edilmiyor (geçmiş veri)",
      source: "quote",
    });
  }

  if (!collectionActionContext) {
    limitations.push("Tahsilat aksiyon verisi eksik; yalnizca teklif durumuna dayanarak hesaplandi.");
  }

  const riskLevel =
    staleActions.length >= HIGH_STALE_ACTION_THRESHOLD || staleQuotes.length >= HIGH_STALE_QUOTE_THRESHOLD
      ? "HIGH"
      : totalStaleItems >= 2
        ? "WATCH"
        : "LOW";

  if (riskLevel === "LOW") return null;

  const confidenceScore = totalStaleItems >= 3 ? 0.68 : 0.50;
  const confidence = confidenceScore >= 0.65 ? "MEDIUM" : "LOW";

  return {
    riskType: "EXECUTION_RISK",
    riskLevel,
    confidence,
    confidenceScore,
    headline: buildExecutionHeadline(riskLevel, staleActions.length, staleQuotes.length),
    explanation: buildExecutionExplanation(staleActions.length, staleQuotes.length, conversionIntelligence),
    actionableStep: buildExecutionAction(staleActions, staleQuotes),
    evidence,
    dataLimitations: limitations,
  };
}

function buildExecutionHeadline(riskLevel: string, staleActionCount: number, staleQuoteCount: number): string {
  if (riskLevel === "HIGH") {
    const parts: string[] = [];
    if (staleActionCount >= HIGH_STALE_ACTION_THRESHOLD) {
      parts.push(`${staleActionCount} aksiyon aksatikilmis`);
    }
    if (staleQuoteCount >= HIGH_STALE_QUOTE_THRESHOLD) {
      parts.push(`${staleQuoteCount} teklif uzun süredir takipsiz`);
    }
    return `Takip disiplini riski: ${parts.join(", ")}.`;
  }
  return "Bazı iş kalemleri takip bekleniyor; hafif gecikme riski mevcut.";
}

function buildExecutionExplanation(
  staleActionCount: number,
  staleQuoteCount: number,
  conversion: QuoteConversionIntelligence | null | undefined,
): string {
  const parts: string[] = [];
  if (staleActionCount > 0) {
    parts.push(`${staleActionCount} tahsilat aksiyonu ${STALE_ACTION_DAYS}+ gündür hareketsiz bekliyor.`);
  }
  if (staleQuoteCount > 0) {
    parts.push(`${staleQuoteCount} teklif ${STALE_QUOTE_DAYS}+ gündür guncellenmedi.`);
  }
  if (conversion?.dominantLossPattern === "VIEWED_NO_FOLLOWUP") {
    parts.push("Geçmiş veride teklifler görüntülendikten sonra takipsiz kalıyor.");
  }
  return parts.join(" ") || "Takip gerilemesi tespit edildi.";
}

function buildExecutionAction(
  staleActions: CollectionActionContext["items"],
  staleQuotes: QuoteContext["activeItems"],
): string | null {
  if (staleActions.length > 0) {
    const first = staleActions[0];
    return `${first.customerName} — ${first.paymentTitle} için ${first.daysOpen} gündür bekleyen aksiyon güncellenmeli.`;
  }
  if (staleQuotes.length > 0) {
    const first = staleQuotes[0];
    return `${first.customerName} — ${first.title} teklifi uzun süredir hareketsiz; müşteri ile iletişime geç.`;
  }
  return null;
}
