import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { ForecastRiskSignal, ForecastEvidence } from "./executive-forecasting.types";

const STALE_ACTION_DAYS = 7;
const HIGH_STALE_THRESHOLD = 3;

export function analyzeCollectionRisk(
  paymentIntelligence: PaymentIntelligence | null | undefined,
  collectionActionContext: CollectionActionContext | null | undefined,
): ForecastRiskSignal | null {
  if (!paymentIntelligence) return null;

  const { cashRiskLevel, overdueRatio, topPriorityItem, riskWarnings, prioritizedItems } = paymentIntelligence;

  if (!paymentIntelligence.hasActiveRisk && (collectionActionContext?.items.length ?? 0) === 0) {
    return null;
  }

  const evidence: ForecastEvidence[] = [];
  const limitations: string[] = [];

  if (overdueRatio > 0) {
    evidence.push({
      dataPoint: "Vadesi gecmis alacak orani",
      value: `%${Math.round(overdueRatio * 100)}`,
      source: "payment",
    });
  }

  if (topPriorityItem) {
    evidence.push({
      dataPoint: `En oncelikli tahsilat — ${topPriorityItem.customerName}`,
      value: `₺${topPriorityItem.remaining.toLocaleString("tr-TR")}, ${topPriorityItem.daysPastDue} gun gecikti`,
      source: "payment",
    });
  }

  const staleActions = (collectionActionContext?.items ?? []).filter(
    (item) => item.daysOpen >= STALE_ACTION_DAYS && item.status === "OPEN",
  );

  if (staleActions.length > 0) {
    evidence.push({
      dataPoint: "Aksiyona gecirilmeyen acik tahsilat aksiyonu",
      value: `${staleActions.length} adet, ${STALE_ACTION_DAYS}+ gun bekliyor`,
      source: "collection_action",
    });
  }

  if (prioritizedItems.length < 3) {
    limitations.push("Sinirli tahsilat kaydina dayanarak hesaplandi.");
  }

  const riskLevel =
    cashRiskLevel === "CRITICAL"
      ? "CRITICAL"
      : cashRiskLevel === "HIGH" || staleActions.length >= HIGH_STALE_THRESHOLD
        ? "HIGH"
        : cashRiskLevel === "MEDIUM"
          ? "WATCH"
          : "LOW";

  const confidenceScore = overdueRatio > 0 ? Math.min(0.90, 0.50 + overdueRatio * 0.6) : 0.40;
  const confidence =
    confidenceScore >= 0.75 ? "HIGH" : confidenceScore >= 0.50 ? "MEDIUM" : "LOW";

  const headline = buildCollectionHeadline(riskLevel, overdueRatio, topPriorityItem);
  const explanation = buildCollectionExplanation(overdueRatio, prioritizedItems.length, staleActions.length, riskWarnings);
  const actionableStep = riskWarnings.length > 0 ? riskWarnings[0] : null;

  return {
    riskType: "COLLECTION_RISK",
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

function buildCollectionHeadline(
  riskLevel: string,
  overdueRatio: number,
  topItem: PaymentIntelligence["topPriorityItem"],
): string {
  if (riskLevel === "CRITICAL") {
    return `Kritik tahsilat riski: alacaklarin %${Math.round(overdueRatio * 100)}'i vadesi gecmis.`;
  }
  if (riskLevel === "HIGH") {
    return topItem
      ? `Yuksek tahsilat riski: ${topItem.customerName} borcunun tahsili ${topItem.daysPastDue} gun gecikti.`
      : "Yuksek tahsilat riski: birden fazla gecikme tespit edildi.";
  }
  if (riskLevel === "WATCH") {
    return "Tahsilat takipte: bazi alacaklarda gecikme veya kismi odeme var.";
  }
  return "Tahsilat riski sinirli.";
}

function buildCollectionExplanation(
  overdueRatio: number,
  totalItems: number,
  staleActionCount: number,
  warnings: string[],
): string {
  const parts: string[] = [];
  if (overdueRatio > 0) {
    parts.push(`Toplam alacagin %${Math.round(overdueRatio * 100)}'i vadesi gecmis durumda.`);
  }
  if (staleActionCount > 0) {
    parts.push(`${staleActionCount} tahsilat aksiyonu ${STALE_ACTION_DAYS}+ gundur takipsiz bekliyor.`);
  }
  if (warnings.length > 0) {
    parts.push(warnings[0]);
  }
  if (totalItems === 0) {
    parts.push("Kayitli tahsilat kalemi bulunamadi.");
  }
  return parts.join(" ") || "Tahsilat durumu degerlendirilemedi.";
}
