import { prisma } from "@/lib/core/shared/prisma";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteConversionIntelligence } from "@/lib/core/quotes/quote-conversion-intelligence-builder";
import type { ForecastRiskSignal, ForecastProjection, ForecastEvidence } from "./executive-forecasting.types";

const STATUS_WEIGHTS = {
  NEGOTIATION: { best: 0.85, worst: 0.20 },
  VIEWED: { best: 0.40, worst: 0.08 },
  SENT: { best: 0.25, worst: 0.03 },
  DRAFT: { best: 0.10, worst: 0.01 },
} as const;

const COLLECTION_RATE = 0.70;

export async function analyzeCashFlow(
  organizationId: string,
  paymentContext: PaymentContext | null | undefined,
  quoteContext: QuoteContext | null | undefined,
  conversionIntelligence: QuoteConversionIntelligence | null | undefined,
): Promise<{ signal: ForecastRiskSignal | null; projection: ForecastProjection }> {
  const now = new Date();
  const cutoff7d = new Date(now.getTime() + 7 * 86400000);
  const cutoff30d = new Date(now.getTime() + 30 * 86400000);

  const [upcoming7d, upcoming30d] = await Promise.all([
    prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: { lte: cutoff7d },
      },
      select: { amount: true, paidAmount: true },
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: { lte: cutoff30d },
      },
      select: { amount: true, paidAmount: true },
    }),
  ]);

  const expectedCollection7d = upcoming7d.reduce(
    (sum, p) => sum + (Number(p.amount) - Number(p.paidAmount)),
    0,
  );
  const expectedCollection30d = upcoming30d.reduce(
    (sum, p) => sum + (Number(p.amount) - Number(p.paidAmount)),
    0,
  );

  const { expectedRevenue30d, bestCaseRevenue, worstCaseRevenue } = buildRevenueProjection(quoteContext, conversionIntelligence);

  const projectedCashInflow = expectedCollection30d * COLLECTION_RATE + expectedRevenue30d * 0.3;

  const limitations: string[] = [];
  if (upcoming30d.length < 3) {
    limitations.push("Gelecek 30 gune ait sinirli odeme kaydina dayanarak hesaplandi.");
  }
  if (!conversionIntelligence?.hasEnoughData) {
    limitations.push("Teklif donusum gecmisi yetersiz; gelir tahmini muhafazakar tutuldu.");
  }
  limitations.push("Gider/masraf verileri sistemde kayitli olmadigi icin net nakit akisi hesaplanamadi.");

  const projection: ForecastProjection = {
    horizon: "30D",
    expectedCollection7d,
    expectedCollection30d,
    expectedRevenue30d,
    bestCaseRevenue,
    worstCaseRevenue,
    projectedCashInflow,
    confidence: upcoming30d.length >= 3 ? "MEDIUM" : "LOW",
    dataLimitations: limitations,
  };

  const signal = buildCashFlowSignal(paymentContext, expectedCollection30d, projectedCashInflow, limitations);

  return { signal, projection };
}

function buildRevenueProjection(
  quoteContext: QuoteContext | null | undefined,
  conversionIntelligence: QuoteConversionIntelligence | null | undefined,
): { expectedRevenue30d: number; bestCaseRevenue: number; worstCaseRevenue: number } {
  if (!quoteContext || quoteContext.activeItems.length === 0) {
    return { expectedRevenue30d: 0, bestCaseRevenue: 0, worstCaseRevenue: 0 };
  }

  const historicalWinRate = conversionIntelligence?.hasEnoughData
    ? conversionIntelligence.winRate
    : null;

  let expectedRevenue30d = 0;
  let bestCaseRevenue = 0;
  let worstCaseRevenue = 0;

  for (const item of quoteContext.activeItems) {
    const weights = STATUS_WEIGHTS[item.status as keyof typeof STATUS_WEIGHTS];
    if (!weights) continue;

    const adjustedExpected = historicalWinRate !== null
      ? item.amount * historicalWinRate * 0.5
      : item.amount * ((weights.best + weights.worst) / 2);

    expectedRevenue30d += adjustedExpected;
    bestCaseRevenue += item.amount * weights.best;
    worstCaseRevenue += item.amount * weights.worst;
  }

  return { expectedRevenue30d, bestCaseRevenue, worstCaseRevenue };
}

function buildCashFlowSignal(
  paymentContext: PaymentContext | null | undefined,
  expectedCollection30d: number,
  projectedCashInflow: number,
  limitations: string[],
): ForecastRiskSignal | null {
  if (!paymentContext) return null;

  const evidence: ForecastEvidence[] = [];

  if (expectedCollection30d > 0) {
    evidence.push({
      dataPoint: "Onumüzdeki 30 gun beklenen tahsilat",
      value: `₺${expectedCollection30d.toLocaleString("tr-TR")}`,
      source: "payment",
    });
  }

  if (projectedCashInflow > 0) {
    evidence.push({
      dataPoint: "Tahmini toplam nakit girisi (30 gun)",
      value: `₺${projectedCashInflow.toLocaleString("tr-TR")}`,
      source: "payment",
    });
  }

  const totalOverdue = paymentContext.totalOverdue;
  if (totalOverdue > 0 && expectedCollection30d === 0) {
    evidence.push({
      dataPoint: "Vadesi gecmis alacak / vadeye giren odeme yok",
      value: `₺${totalOverdue.toLocaleString("tr-TR")} gecmis, 30 gunde tahsilat planlanmamis`,
      source: "payment",
    });
  }

  const riskLevel =
    expectedCollection30d === 0 && totalOverdue > 0
      ? "HIGH"
      : expectedCollection30d < totalOverdue * 0.3
        ? "WATCH"
        : "LOW";

  if (riskLevel === "LOW") return null;

  return {
    riskType: "CASH_FLOW",
    riskLevel,
    confidence: "LOW",
    confidenceScore: 0.38,
    headline:
      riskLevel === "HIGH"
        ? "Nakit akisi riski: onumüzdeki 30 gunde planli tahsilat yok, birikmis alacak mevcut."
        : "Nakit akisi takipte: tahsilat, vadesi gecmis alacakla orantisiz.",
    explanation:
      `Gelecek 30 gun icinde vadeye girecek tahsilat: ₺${expectedCollection30d.toLocaleString("tr-TR")}. ` +
      `Birikmis vadesi gecmis alacak: ₺${totalOverdue.toLocaleString("tr-TR")}.`,
    actionableStep:
      totalOverdue > 0
        ? "Vadesi gecmis alacaklar icin oncelikli tahsilat aksiyonu planlayın."
        : null,
    evidence,
    dataLimitations: limitations,
  };
}
