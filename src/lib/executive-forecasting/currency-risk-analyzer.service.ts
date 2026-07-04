import { prisma } from "@/lib/core/shared/prisma";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ForecastRiskSignal, ForecastEvidence } from "./executive-forecasting.types";

export async function analyzeCurrencyRisk(
  organizationId: string,
  latestBriefing: BriefingPackage | null | undefined,
): Promise<ForecastRiskSignal | null> {
  const [nonTryQuoteCount, nonTryPaymentCount] = await Promise.all([
    prisma.quote.count({ where: { organizationId, currency: { not: "TRY" } } }),
    prisma.payment.count({ where: { organizationId, currency: { not: "TRY" } } }),
  ]);

  const hasExposure = nonTryQuoteCount > 0 || nonTryPaymentCount > 0;

  if (!hasExposure) return null;

  const financialSignals = extractFinancialSignals(latestBriefing);
  const hasNegativeSignal = financialSignals.some((s) => s.yon === "NEGATIF");
  const hasPositiveSignal = financialSignals.some((s) => s.yon === "POZITIF");

  const evidence: ForecastEvidence[] = [];
  const limitations: string[] = [];

  if (nonTryQuoteCount > 0) {
    evidence.push({
      dataPoint: "Dovizli acik teklif",
      value: `${nonTryQuoteCount} teklif`,
      source: "quote",
    });
  }

  if (nonTryPaymentCount > 0) {
    evidence.push({
      dataPoint: "Dovizli bekleyen odeme",
      value: `${nonTryPaymentCount} odeme`,
      source: "payment",
    });
  }

  if (financialSignals.length > 0) {
    const signalText = financialSignals
      .slice(0, 2)
      .map((s) => s.aciklama)
      .join("; ");
    evidence.push({
      dataPoint: "Sabah brifinginden finansal etki sinyali",
      value: signalText,
      source: "briefing",
    });
  }

  if (!latestBriefing) {
    limitations.push("Guncel kur/piyasa brifing verisi mevcut degil; risk duzey tahmini gozlemsel.");
  }
  limitations.push("Gercek zamanli doviz kuru verisi kullanilmiyor; maruziyet hacmi tahminidir.");

  const riskLevel = hasNegativeSignal
    ? "HIGH"
    : hasExposure && !latestBriefing
      ? "WATCH"
      : hasPositiveSignal
        ? "LOW"
        : "WATCH";

  const confidenceScore = latestBriefing ? 0.65 : 0.35;
  const confidence = confidenceScore >= 0.60 ? "MEDIUM" : "LOW";

  const headline = buildCurrencyHeadline(riskLevel, nonTryQuoteCount, nonTryPaymentCount);
  const explanation = buildCurrencyExplanation(nonTryQuoteCount, nonTryPaymentCount, financialSignals, latestBriefing);
  const actionableStep = hasNegativeSignal
    ? "Dovizli sozlesmeleri gozden gecirin; kur riskine karsi vade veya fiyat kilitlemesi degerlendirin."
    : "Dovizli pozisyonlarinizi takip edin; ani kur hareketlerine karsi erken uyari belirleyin.";

  return {
    riskType: "CURRENCY_RISK",
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

type FinancialSignal = { yon: string; aciklama: string };

function extractFinancialSignals(briefing: BriefingPackage | null | undefined): FinancialSignal[] {
  if (!briefing) return [];

  const signals: FinancialSignal[] = [];

  for (const item of briefing.kritikItems) {
    const fin = item.finansal_etki;
    if (fin && fin.yon !== "NOTR") {
      signals.push({ yon: fin.yon, aciklama: fin.aciklama });
    }
  }

  return signals;
}

function buildCurrencyHeadline(
  riskLevel: string,
  quoteCount: number,
  paymentCount: number,
): string {
  if (riskLevel === "HIGH") {
    return `Kur riski yuksek: ${quoteCount + paymentCount} dovizli pozisyon ve olumsuz finansal sinyal mevcut.`;
  }
  if (riskLevel === "WATCH") {
    return `Kur maruziyet takipte: ${quoteCount} teklif + ${paymentCount} odeme dovizli.`;
  }
  return `Kur maruziyet dusuk: guncel sinyal olumlu.`;
}

function buildCurrencyExplanation(
  quoteCount: number,
  paymentCount: number,
  signals: FinancialSignal[],
  briefing: BriefingPackage | null | undefined,
): string {
  const parts: string[] = [];
  parts.push(`${quoteCount} dovizli teklif ve ${paymentCount} dovizli odeme kaydedildi.`);
  if (signals.length > 0) {
    const negCount = signals.filter((s) => s.yon === "NEGATIF").length;
    const posCount = signals.filter((s) => s.yon === "POZITIF").length;
    if (negCount > 0) {
      parts.push(`Guncel brifingde ${negCount} olumsuz finansal sinyal var.`);
    } else if (posCount > 0) {
      parts.push(`Guncel brifingde finansal gorunum nispeten olumlu.`);
    }
  } else if (!briefing) {
    parts.push("Guncel piyasa brifing verisi bulunmuyor; kur durumu degerlendirilemedi.");
  }
  return parts.join(" ");
}
